import { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { CHANNELS, MONTHS, PUB_ESTADOS, WEEKDAYS, fmtLong, fmtShort, projectColor, sameDay, splitMedia, timeAgo } from '../lib/data.js'
import { ChannelTile, Cover, DemoBanner, Empty, Icon, Menu, Modal, PageHead, ProjectFilter, StatusBadge, Thumb, firstMedia, stateDot } from './ui.jsx'
import { aggregateStatus, destLabel } from '../lib/destinations.js'

const VIEW_LABELS = { calendar: 'Mes', list: 'Lista' }

// Una publicación se muestra una vez por destino (cuenta); sin destinos, una sola vez con su estado de la hoja.
function occurrencesOf(pub, account, accountById) {
  if (!pub.destinos?.length) return [{ key: pub.id, pub, dest: null, acc: null, hora: pub.hora || '', label: pub.estado || '' }]
  const dests = pub.destinos.filter((d) => !account || d.accountId === account.id)
  return dests.map((d) => ({
    key: `${pub.id}:${d.id}`, pub, dest: d, acc: accountById(d.accountId),
    hora: d.scheduledAt ? `${String(d.scheduledAt.getHours()).padStart(2, '0')}:${String(d.scheduledAt.getMinutes()).padStart(2, '0')}` : pub.hora || '',
    label: destLabel(d.status),
  }))
}

function ViewSwitch() {
  const { view, setView } = useApp()
  return (
    <div className="segmented" role="tablist" aria-label="Vista">
      {Object.entries(VIEW_LABELS).map(([k, l]) => (
        <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)} role="tab" aria-selected={view === k}>{l}</button>
      ))}
    </div>
  )
}

function Filters() {
  const app = useApp()
  const active = app.projectsFilter.length || app.canalFilter || app.estadoFilter
  return (
    <div className="toolbar">
      <div className="search">
        <Icon name="search" size={15} />
        <input className="input" placeholder="Buscar publicaciones…" aria-label="Buscar publicaciones" value={app.search} onChange={(e) => app.setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && app.setSearch('')} />
      </div>
      <ProjectFilter projects={app.projectNames} value={app.projectsFilter} onChange={app.setProjectsFilter} />
      <select className="select filters-select" value={app.canalFilter} onChange={(e) => app.setCanalFilter(e.target.value)} aria-label="Canal">
        <option value="">Todos los canales</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className="select filters-select" value={app.estadoFilter} onChange={(e) => app.setEstadoFilter(e.target.value)} aria-label="Estado">
        <option value="">Todos los estados</option>{PUB_ESTADOS.map((c) => <option key={c}>{c}</option>)}
      </select>
      {active ? <button className="btn btn-ghost btn-sm" onClick={() => { app.setProjectsFilter([]); app.setCanalFilter(''); app.setEstadoFilter('') }}><Icon name="x" size={13} /> Limpiar</button> : null}
    </div>
  )
}

function MonthNav() {
  const app = useApp()
  return (
    <div className="cal-nav">
      <button className="btn btn-icon btn-sm" onClick={() => app.shiftMonth(-1)} aria-label="Mes anterior"><Icon name="left" size={15} /></button>
      <div className="cal-title" aria-live="polite">{MONTHS[app.month]} {app.year}</div>
      <button className="btn btn-icon btn-sm" onClick={() => app.shiftMonth(1)} aria-label="Mes siguiente"><Icon name="right" size={15} /></button>
      <button className="btn btn-sm" onClick={app.goToday}>Hoy</button>
    </div>
  )
}

function MonthSummary({ pubs }) {
  const { year, month } = useApp()
  const inMonth = pubs.filter((p) => p.fecha && p.fecha.getFullYear() === year && p.fecha.getMonth() === month)
  const n = (e) => inMonth.filter((p) => (p.estado || '').toLowerCase() === e).length
  return (
    <div className="summary">
      <span className="item"><b>{inMonth.length}</b> publicaciones</span>
      <span className="item"><i className="state-dot" style={{ '--dot': stateDot('programado') }} /><b>{n('programado')}</b> programadas</span>
      <span className="item"><i className="state-dot" style={{ '--dot': stateDot('publicado') }} /><b>{n('publicado')}</b> publicadas</span>
    </div>
  )
}

function ErrorBanner() {
  const app = useApp()
  if (!app.error || app.demo) return null
  return (
    <div className="banner err"><Icon name="info" size={15} /><span className="grow"><b>Error al sincronizar.</b> {app.error}</span>
      <button onClick={() => app.loadPublications(true)}>Reintentar</button><button onClick={app.enterDemo}>Ver ejemplo</button></div>
  )
}

// ── Calendario ────────────────────────────────────────────────────────────
function buildDays(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const total = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7
  return Array.from({ length: total }, (_, i) => new Date(year, month, 1 - offset + i))
}

function DayModal({ date, items, onClose }) {
  const app = useApp()
  return (
    <Modal onClose={onClose} size="narrow">
      <div className="dialog-head">
        <div><h2>{fmtLong(date)}</h2><small>{items.length} publicaci{items.length === 1 ? 'ón' : 'ones'}</small></div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
      </div>
      <div style={{ padding: '6px 20px 14px' }}>
        {items.map((o) => (
          <button key={o.key} className="list-row" onClick={() => { onClose(); app.setSelectedPub(o.pub) }}>
            <Thumb media={firstMedia(o.pub)} tipo={o.pub.tipo} project={o.pub.proyecto} />
            <div className="grow"><b className="trunc list-title">{o.pub.titulo || o.pub.proyecto}</b><small className="trunc" style={{ display: 'block' }}>{[o.hora, o.acc ? `@${o.acc.handle}` : o.pub.proyecto].filter(Boolean).join(' · ')}</small></div>
            <StatusBadge estado={o.label} />
          </button>
        ))}
      </div>
    </Modal>
  )
}

function CalendarView() {
  const app = useApp()
  const { year, month, filteredPublications: pubs, account } = app
  const [dayOpen, setDayOpen] = useState(null)
  const days = useMemo(() => buildDays(year, month), [year, month])
  const byDay = useMemo(() => {
    const m = new Map()
    pubs.forEach((p) => {
      if (!p.fecha) return
      const k = `${p.fecha.getFullYear()}-${p.fecha.getMonth()}-${p.fecha.getDate()}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(...occurrencesOf(p, account, app.accountById))
    })
    m.forEach((l) => l.sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99')))
    return m
  }, [pubs, account, app.accountById])
  const today = new Date()
  const LIMIT = 3
  const addOn = (d) => app.requireAuth(() => { app.setNewPubDate(d); app.setEditing('new') })

  return (
    <div className="card cal-card">
      <div className="cal-weekdays">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="cal-grid">
        {days.map((d) => {
          const list = byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) || []
          return (
            <div key={d.toISOString()} className={`cal-cell ${d.getMonth() !== month ? 'out' : ''} ${sameDay(d, today) ? 'today' : ''}`}>
              <div className="cal-cell-head">
                <span className="cal-num">{d.getDate()}</span>
                <button className="cal-add" onClick={() => addOn(d)} aria-label={`Crear publicación el ${d.getDate()}`}><Icon name="plus" size={13} /></button>
              </div>
              {list.slice(0, LIMIT).map((o) => (
                <button key={o.key} className="cal-post" onClick={() => app.setSelectedPub(o.pub)} title={`${o.pub.proyecto} · ${o.pub.titulo}${o.acc ? ` · @${o.acc.handle}` : ''}${o.label ? ` · ${o.label}` : ''}`}>
                  <Thumb media={firstMedia(o.pub)} tipo={o.pub.tipo} size="sm" project={o.pub.proyecto} />
                  <span className="body">
                    <span className="ti">{o.pub.titulo || o.pub.proyecto}</span>
                    <span className="meta">{(o.dest?.canal || o.pub.canal) && <ChannelTile canal={o.dest?.canal || o.pub.canal} size={12} />}<span className="acct">{[o.hora, o.acc ? `@${o.acc.handle}` : o.pub.proyecto.toLowerCase()].filter(Boolean).join(' · ')}</span></span>
                  </span>
                  <i className="state-dot" style={{ '--dot': stateDot(o.label) }} title={o.label || 'Sin estado'} />
                </button>
              ))}
              {list.length > LIMIT && <button className="cal-more" onClick={() => setDayOpen({ date: d, items: list })}>+{list.length - LIMIT} más</button>}
            </div>
          )
        })}
      </div>
      {dayOpen && <DayModal date={dayOpen.date} items={dayOpen.items} onClose={() => setDayOpen(null)} />}
    </div>
  )
}

// ── Lista ─────────────────────────────────────────────────────────────────
export function PubTable({ pubs }) {
  const app = useApp()
  const [sel, setSel] = useState(new Set())
  const allOn = pubs.length > 0 && pubs.every((p) => sel.has(p.id))
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {sel.size > 0 && (
        <div className="banner demo" style={{ margin: 0, borderRadius: 0, border: 0, borderBottom: '1px solid var(--accent-100)' }}>
          <b className="grow">{sel.size} seleccionada{sel.size > 1 ? 's' : ''}</b>
          <button onClick={() => setSel(new Set())}>Limpiar selección</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="col-check" style={{ width: 44 }}><input type="checkbox" className="check" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(pubs.map((p) => p.id)))} aria-label="Seleccionar todas" /></th>
              <th>Contenido</th><th className="hide-sm">Proyecto</th><th className="hide-sm">Cuenta</th><th className="hide-sm">Canal</th><th className="hide-sm">Fecha</th><th className="col-state">Estado</th><th className="hide-sm" style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {pubs.map((p) => {
              const c = projectColor(p.proyecto)
              const accs = (p.destinos || []).map((d) => app.accountById(d.accountId)).filter(Boolean)
              const agg = aggregateStatus(p.destinos)
              return (
                <tr key={p.id} className={sel.has(p.id) ? 'selected' : ''} onClick={() => app.setSelectedPub(p)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Seleccionar ${p.titulo}`} /></td>
                  <td>
                    <div className="cell-main">
                      <Thumb media={firstMedia(p)} tipo={p.tipo} project={p.proyecto} />
                      <div style={{ minWidth: 0 }}>
                        <b className="trunc">{p.titulo || p.proyecto}</b>
                        <small className="trunc"><span style={{ textTransform: 'capitalize' }}>{p.tipo || 'imagen'}</span></small>
                        <small className="cell-sub-mobile trunc">{fmtShort(p.fecha)} · {accs.length ? `@${accs[0].handle}` : p.proyecto}</small>
                      </div>
                    </div>
                  </td>
                  <td className="hide-sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><i className="state-dot" style={{ '--dot': c.dot }} />{p.proyecto}</span></td>
                  <td className="hide-sm">{accs.length ? <span title={accs.map((a) => `@${a.handle}`).join(', ')}>@{accs[0].handle}{accs.length > 1 && <span className="muted"> +{accs.length - 1}</span>}</span> : <span className="muted">—</span>}</td>
                  <td className="hide-sm">{p.canal ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ChannelTile canal={p.canal} size={20} />{p.canal}</span> : <span className="muted">—</span>}</td>
                  <td className="hide-sm" style={{ whiteSpace: 'nowrap' }}><span style={{ fontWeight: 500 }}>{fmtShort(p.fecha)}</span>{p.hora && <small className="muted" style={{ display: 'block' }}>{p.hora}</small>}</td>
                  <td><StatusBadge estado={agg ? destLabel(agg) : p.estado} />{(p.destinos?.length || 0) > 1 && <small className="muted" style={{ display: 'block', marginTop: 2 }}>{p.destinos.length} destinos</small>}</td>
                  <td className="actions hide-sm">
                    <Menu items={[
                      { label: 'Abrir', icon: 'external', onClick: () => app.setSelectedPub(p) },
                      { label: 'Editar', icon: 'edit', onClick: () => app.requireAuth(() => app.setEditing(p)) },
                    ]} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ListView() {
  const app = useApp()
  const [scope, setScope] = useState('month')
  const pubs = app.filteredPublications.filter((p) => scope === 'all' || (p.fecha && p.fecha.getFullYear() === app.year && p.fecha.getMonth() === app.month))
  return (
    <>
      <div className="toolbar"><div className="segmented"><button className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>Este mes</button><button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Todo</button></div></div>
      {pubs.length === 0 ? <div className="card"><Empty icon="list" title="No hay publicaciones">No hay publicaciones con estos filtros en este periodo.</Empty></div> : <PubTable pubs={pubs} />}
    </>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
const TITLES = { calendar: 'Calendario', list: 'Publicaciones' }
const SUBTITLES = {
  calendar: 'Planifica y revisa el contenido de todos tus proyectos.',
  list: 'Listado completo de publicaciones con filtros.',
}

export default function PubViews() {
  const app = useApp()
  const { view } = app
  const searching = app.search.trim().length >= 2
  const monthly = !searching
  return (
    <div className="view-enter" key={view}>
      <PageHead title={TITLES[view]} subtitle={SUBTITLES[view]}>
        <button className="btn btn-icon" onClick={() => app.loadPublications(true)} title={app.lastSynced ? `Sincronizado ${timeAgo(app.lastSynced)}` : 'Sincronizar'} aria-label="Sincronizar"><Icon name="refresh" size={15} className={app.loading ? 'spin' : ''} /></button>
        <button className="btn btn-primary" onClick={() => app.requireAuth(() => { app.setNewPubDate(null); app.setEditing('new') })}><Icon name="plus" size={15} /> Crear</button>
      </PageHead>
      <DemoBanner />
      <ErrorBanner />
      <div className="toolbar split-ends" style={{ marginBottom: 12 }}>
        {monthly ? <MonthNav /> : <span />}
        <div className="toolbar" style={{ margin: 0 }}>
          <MonthSummary pubs={app.filteredPublications} />
          <ViewSwitch />
        </div>
      </div>
      <Filters />
      {app.loading && app.publications.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>{[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 10 }} />)}</div>
      ) : searching ? (
        <div>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{app.filteredPublications.length === 0 ? 'Sin resultados' : `${app.filteredPublications.length} resultado${app.filteredPublications.length > 1 ? 's' : ''}`}</div>
          {app.filteredPublications.length ? <PubTable pubs={app.filteredPublications} /> : <div className="card"><Empty icon="search" title="Nada coincide con tu búsqueda">Prueba con otro título, proyecto o canal.</Empty></div>}
        </div>
      ) : view === 'calendar' ? <CalendarView /> : <ListView />}
    </div>
  )
}
