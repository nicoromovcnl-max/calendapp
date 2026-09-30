import { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { CHANNELS, MONTHS, PUB_ESTADOS, WEEKDAYS, fmtLong, fmtShort, projectColor, sameDay, splitMedia, timeAgo } from '../lib/data.js'
import { ChannelTile, Cover, DemoBanner, Empty, Icon, Menu, Modal, PageHead, ProjectFilter, StatusBadge, Thumb, firstMedia, stateDot } from './ui.jsx'

const VIEW_LABELS = { calendar: 'Mes', list: 'Lista', feed: 'Visual Feed' }

// Texto secundario común a calendario, lista y feed: hora · @cuenta.
function usePubMeta() {
  const { accountOf } = useApp()
  return (p) => {
    const acc = accountOf(p.proyecto)
    return { acc: acc ? `@${acc.handle}` : '', hora: p.hora || '' }
  }
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

function DayModal({ date, pubs, onClose }) {
  const app = useApp()
  return (
    <Modal onClose={onClose} size="narrow">
      <div className="dialog-head">
        <div><h2>{fmtLong(date)}</h2><small>{pubs.length} publicaci{pubs.length === 1 ? 'ón' : 'ones'}</small></div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
      </div>
      <div style={{ padding: '6px 20px 14px' }}>
        {pubs.map((p) => (
          <button key={p.id} className="list-row" onClick={() => { onClose(); app.setSelectedPub(p) }}>
            <Thumb media={firstMedia(p)} tipo={p.tipo} project={p.proyecto} />
            <div className="grow"><b className="trunc list-title">{p.titulo || p.proyecto}</b><small className="trunc" style={{ display: 'block' }}>{p.proyecto}</small></div>
            <StatusBadge estado={p.estado} />
          </button>
        ))}
      </div>
    </Modal>
  )
}

function CalendarView() {
  const app = useApp()
  const meta = usePubMeta()
  const { year, month, filteredPublications: pubs } = app
  const [dayOpen, setDayOpen] = useState(null)
  const days = useMemo(() => buildDays(year, month), [year, month])
  const byDay = useMemo(() => {
    const m = new Map()
    pubs.forEach((p) => {
      if (!p.fecha) return
      const k = `${p.fecha.getFullYear()}-${p.fecha.getMonth()}-${p.fecha.getDate()}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(p)
    })
    m.forEach((l) => l.sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99')))
    return m
  }, [pubs])
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
              {list.slice(0, LIMIT).map((p) => {
                const m = meta(p)
                return (
                  <button key={p.id} className="cal-post" onClick={() => app.setSelectedPub(p)} title={`${p.proyecto} · ${p.titulo}`}>
                    <Thumb media={firstMedia(p)} tipo={p.tipo} size="sm" project={p.proyecto} />
                    <span className="body">
                      <span className="ti">{p.titulo || p.proyecto}</span>
                      <span className="meta">{p.canal && <ChannelTile canal={p.canal} size={12} />}<span className="acct">{[m.hora, m.acc || p.proyecto.toLowerCase()].filter(Boolean).join(' · ')}</span></span>
                    </span>
                    <i className="state-dot" style={{ '--dot': stateDot(p.estado) }} title={p.estado || 'Sin estado'} />
                  </button>
                )
              })}
              {list.length > LIMIT && <button className="cal-more" onClick={() => setDayOpen({ date: d, list })}>+{list.length - LIMIT} más</button>}
            </div>
          )
        })}
      </div>
      {dayOpen && <DayModal date={dayOpen.date} pubs={dayOpen.list} onClose={() => setDayOpen(null)} />}
    </div>
  )
}

// ── Lista ─────────────────────────────────────────────────────────────────
export function PubTable({ pubs }) {
  const app = useApp()
  const meta = usePubMeta()
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
              <th>Contenido</th><th className="hide-sm">Proyecto</th><th className="hide-sm">Canal</th><th className="hide-sm">Fecha</th><th className="col-state">Estado</th><th className="hide-sm" style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {pubs.map((p) => {
              const c = projectColor(p.proyecto)
              const m = meta(p)
              return (
                <tr key={p.id} className={sel.has(p.id) ? 'selected' : ''} onClick={() => app.setSelectedPub(p)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Seleccionar ${p.titulo}`} /></td>
                  <td>
                    <div className="cell-main">
                      <Thumb media={firstMedia(p)} tipo={p.tipo} project={p.proyecto} />
                      <div style={{ minWidth: 0 }}>
                        <b className="trunc">{p.titulo || p.proyecto}</b>
                        <small className="trunc"><span style={{ textTransform: 'capitalize' }}>{p.tipo || 'imagen'}</span>{m.acc && ` · ${m.acc}`}</small>
                        <small className="cell-sub-mobile trunc">{fmtShort(p.fecha)} · {p.proyecto}</small>
                      </div>
                    </div>
                  </td>
                  <td className="hide-sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><i className="state-dot" style={{ '--dot': c.dot }} />{p.proyecto}</span></td>
                  <td className="hide-sm">{p.canal ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ChannelTile canal={p.canal} size={20} />{p.canal}</span> : <span className="muted">—</span>}</td>
                  <td className="hide-sm" style={{ whiteSpace: 'nowrap' }}><span style={{ fontWeight: 500 }}>{fmtShort(p.fecha)}</span>{p.hora && <small className="muted" style={{ display: 'block' }}>{p.hora}</small>}</td>
                  <td><StatusBadge estado={p.estado} /></td>
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

// ── Visual Feed ───────────────────────────────────────────────────────────
export function FeedCard({ pub, onOpen }) {
  const meta = usePubMeta()(pub)
  const n = splitMedia(pub.media).length
  return (
    <button className="media-card" onClick={onOpen} aria-label={pub.titulo || pub.proyecto}>
      <div className="mc-media">
        <Cover media={firstMedia(pub)} tipo={pub.tipo} iconSize={34} />
        <div className="mc-top">
          {pub.canal ? <ChannelTile canal={pub.canal} size={26} onMedia /> : <span />}
          {n > 1 && <span className="mc-count">1/{n}</span>}
        </div>
        {pub.estado && <div className="mc-bottom"><StatusBadge estado={pub.estado} glass /></div>}
      </div>
      <div className="mc-body">
        <div className="mc-meta"><span>{fmtShort(pub.fecha)}{meta.hora && ` · ${meta.hora}`}</span><span>·</span><span className="trunc">{meta.acc || pub.proyecto}</span></div>
        <div className="mc-title clamp-2">{pub.titulo || pub.proyecto}</div>
      </div>
    </button>
  )
}

function FeedView() {
  const app = useApp()
  const [tab, setTab] = useState('posts')
  const [limit, setLimit] = useState(24)
  const list = useMemo(() => {
    const f = app.filteredPublications.filter((p) => {
      const t = (p.tipo || '').toLowerCase()
      return tab === 'reels' ? t === 'reel' : tab === 'stories' ? t === 'historia' : t !== 'historia'
    })
    return [...f].sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
  }, [app.filteredPublications, tab])
  return (
    <>
      <div className="toolbar">
        <div className="segmented">{[['posts', 'Posts'], ['reels', 'Reels'], ['stories', 'Stories']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setLimit(24) }}>{l}</button>)}</div>
        <span className="muted" style={{ fontSize: 12.5 }}>{list.length} publicaciones</span>
      </div>
      {list.length === 0 ? <div className="card"><Empty icon="grid" title="Nada que mostrar">No hay publicaciones de este tipo con los filtros actuales.</Empty></div> : (
        <>
          <div className="media-grid">{list.slice(0, limit).map((p) => <FeedCard key={p.id} pub={p} onOpen={() => app.setSelectedPub(p)} />)}</div>
          {list.length > limit && <div style={{ textAlign: 'center', marginTop: 28 }}><button className="btn" onClick={() => setLimit((l) => l + 24)}>Cargar más</button></div>}
        </>
      )}
    </>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
const TITLES = { calendar: 'Calendario', list: 'Publicaciones', feed: 'Visual Feed' }
const SUBTITLES = {
  calendar: 'Planifica y revisa el contenido de todos tus proyectos.',
  list: 'Listado completo de publicaciones con filtros.',
  feed: 'Revisa visualmente el calendario editorial.',
}

export default function PubViews() {
  const app = useApp()
  const { view } = app
  const searching = app.search.trim().length >= 2
  const monthly = (view === 'calendar' || view === 'list') && !searching
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
          {(view === 'calendar' || view === 'list') && <MonthSummary pubs={app.filteredPublications} />}
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
      ) : view === 'calendar' ? <CalendarView /> : view === 'list' ? <ListView /> : <FeedView />}
    </div>
  )
}
