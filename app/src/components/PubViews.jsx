import { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { CHANNELS, MONTHS, MONTHS_SHORT, PUB_ESTADOS, TIPOS, WEEKDAYS, fmtLong, fmtShort, projectColor, sameDay, splitMedia, timeAgo } from '../lib/data.js'
import { ChannelTile, Cover, Empty, Icon, Modal, PageHead, ProjectFilter, StatusBadge, Thumb, firstMedia, tipoIcon } from './ui.jsx'

const VIEW_LABELS = { calendar: 'Mes', list: 'Lista', feed: 'Visual Feed' }

function ViewSwitch() {
  const { view, setView } = useApp()
  return (
    <div className="segmented" role="tablist">
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
    <>
      <div className="search">
        <Icon name="search" size={15} />
        <input className="input" placeholder="Buscar publicaciones…" value={app.search} onChange={(e) => app.setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && app.setSearch('')} />
      </div>
      <ProjectFilter projects={app.projectNames} value={app.projectsFilter} onChange={app.setProjectsFilter} />
      <select className="select filters-select" value={app.canalFilter} onChange={(e) => app.setCanalFilter(e.target.value)} aria-label="Canal">
        <option value="">Todos los canales</option>
        {CHANNELS.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className="select filters-select" value={app.estadoFilter} onChange={(e) => app.setEstadoFilter(e.target.value)} aria-label="Estado">
        <option value="">Todos los estados</option>
        {PUB_ESTADOS.map((c) => <option key={c}>{c}</option>)}
      </select>
      {active ? <button className="btn btn-ghost btn-sm" onClick={() => { app.setProjectsFilter([]); app.setCanalFilter(''); app.setEstadoFilter('') }}><Icon name="x" size={13} /> Limpiar</button> : null}
    </>
  )
}

function SyncButton() {
  const app = useApp()
  return (
    <button className="btn btn-icon" onClick={() => app.loadPublications(true)} title={app.lastSynced ? `Sincronizado ${timeAgo(app.lastSynced)}` : 'Sincronizar'} aria-label="Sincronizar">
      <Icon name="refresh" size={15} className={app.loading ? 'spin' : ''} />
    </button>
  )
}

function CreateButton() {
  const app = useApp()
  return <button className="btn btn-primary" onClick={() => app.requireAuth(() => app.setEditing('new'))}><Icon name="plus" size={15} /> Crear</button>
}

function MonthNav() {
  const app = useApp()
  return (
    <div className="cal-head">
      <button className="btn btn-icon btn-sm" onClick={() => app.shiftMonth(-1)} aria-label="Mes anterior"><Icon name="left" size={15} /></button>
      <div className="cal-title">{MONTHS[app.month]} {app.year}</div>
      <button className="btn btn-icon btn-sm" onClick={() => app.shiftMonth(1)} aria-label="Mes siguiente"><Icon name="right" size={15} /></button>
      <button className="btn btn-sm" onClick={app.goToday}>Hoy</button>
    </div>
  )
}

function MonthSummary({ pubs }) {
  const { year, month } = useApp()
  const inMonth = pubs.filter((p) => p.fecha && p.fecha.getFullYear() === year && p.fecha.getMonth() === month)
  const byTipo = {}
  inMonth.forEach((p) => { const t = p.tipo || 'imagen'; byTipo[t] = (byTipo[t] || 0) + 1 })
  return (
    <div className="summary-pill">
      <span><b>{inMonth.length}</b> pub. {MONTHS[month]}</span>
      {TIPOS.filter((t) => byTipo[t]).map((t) => (
        <span key={t} className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={t}><Icon name={tipoIcon[t]} size={13} />{byTipo[t]}</span>
      ))}
    </div>
  )
}

function DemoBanner() {
  const app = useApp()
  if (!app.demo) return null
  return <div className="banner demo"><Icon name="flame" size={15} /><span className="grow"><b>Modo demo</b> · estás viendo datos de ejemplo, no se guarda nada en la hoja.</span><button onClick={app.exitDemo}>Salir</button></div>
}

function ErrorBanner() {
  const app = useApp()
  if (!app.error || app.demo) return null
  return (
    <div className="banner err"><Icon name="info" size={15} /><span className="grow"><b>Error al sincronizar.</b> {app.error}</span>
      <button onClick={() => app.loadPublications(true)}>Reintentar</button><button onClick={app.enterDemo}>Ver ejemplo</button></div>
  )
}

// ── Resultados de búsqueda ────────────────────────────────────────────────
function SearchResults({ pubs }) {
  const app = useApp()
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{pubs.length === 0 ? 'Sin resultados' : `${pubs.length} resultado${pubs.length > 1 ? 's' : ''}`}</div>
      {pubs.length > 0 && <PubTable pubs={pubs} />}
      {pubs.length === 0 && <div className="card"><Empty icon="search" title="Nada coincide con tu búsqueda">Prueba con otro título, proyecto o canal.</Empty></div>}
    </div>
  )
}

// ── Calendario ────────────────────────────────────────────────────────────
function buildWeeks(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const days = []
  const total = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7
  for (let i = 0; i < total; i++) days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  return days
}

function DayModal({ date, pubs, onClose }) {
  const app = useApp()
  return (
    <Modal onClose={onClose} size="narrow">
      <div className="dialog-head"><div><h2 >{fmtLong(date)}</h2><small>{pubs.length} publicaci{pubs.length === 1 ? 'ón' : 'ones'}</small></div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button></div>
      <div style={{ padding: 12 }}>
        {pubs.map((p) => (
          <button key={p.id} className="top-row" style={{ padding: '10px 8px' }} onClick={() => { onClose(); app.setSelectedPub(p) }}>
            <Thumb media={firstMedia(p)} tipo={p.tipo} />
            <div style={{ minWidth: 0, flex: 1 }}><b className="trunc" style={{ display: 'block' }}>{p.titulo || p.proyecto}</b><small className="muted">{p.proyecto}</small></div>
            <StatusBadge estado={p.estado} />
          </button>
        ))}
      </div>
    </Modal>
  )
}

function CalendarView() {
  const app = useApp()
  const { year, month, filteredPublications: pubs } = app
  const [dayOpen, setDayOpen] = useState(null)
  const days = useMemo(() => buildWeeks(year, month), [year, month])
  const byDay = useMemo(() => {
    const m = new Map()
    pubs.forEach((p) => {
      if (!p.fecha) return
      const k = `${p.fecha.getFullYear()}-${p.fecha.getMonth()}-${p.fecha.getDate()}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(p)
    })
    return m
  }, [pubs])
  const today = new Date()
  const LIMIT = 3

  return (
    <div className="card cal-card">
      <div className="cal-weekdays">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="cal-grid">
        {days.map((d) => {
          const list = byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) || []
          const out = d.getMonth() !== month
          return (
            <div key={d.toISOString()} className={`cal-cell ${out ? 'out' : ''} ${sameDay(d, today) ? 'today' : ''}`}>
              <div className="cal-num">{d.getDate()}</div>
              {list.slice(0, LIMIT).map((p) => {
                const c = projectColor(p.proyecto)
                return (
                  <button key={p.id} className="cal-chip" style={{ borderLeft: `3px solid ${c.dot}` }} onClick={() => app.setSelectedPub(p)} title={`${p.proyecto} · ${p.titulo}`}>
                    <Thumb media={firstMedia(p)} tipo={p.tipo} size="sm" style={{ width: 26, height: 26 }} />
                    <span className="t"><span className="ti">{p.titulo || p.proyecto}</span><span className="st">{p.estado || p.canal || p.proyecto}</span></span>
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
  const [sel, setSel] = useState(new Set())
  const allOn = pubs.length > 0 && pubs.every((p) => sel.has(p.id))
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <div className="card">
      {sel.size > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'center', background: 'var(--green-50)', fontSize: 13 }}>
          <b>{sel.size} seleccionada{sel.size > 1 ? 's' : ''}</b>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>Limpiar selección</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}><input type="checkbox" className="check" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(pubs.map((p) => p.id)))} aria-label="Seleccionar todas" /></th>
              <th>Contenido</th><th className="hide-sm">Proyecto</th><th className="hide-sm">Canal</th><th>Fecha</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {pubs.map((p) => {
              const c = projectColor(p.proyecto)
              return (
                <tr key={p.id} className={sel.has(p.id) ? 'selected' : ''} onClick={() => app.setSelectedPub(p)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label="Seleccionar" /></td>
                  <td><div className="cell-main"><Thumb media={firstMedia(p)} tipo={p.tipo} /><div style={{ minWidth: 0 }}><b className="trunc" style={{ maxWidth: 320 }}>{p.titulo || p.proyecto}</b><small className="trunc" style={{ display: 'block' }}>{p.tipo}</small></div></div></td>
                  <td className="hide-sm"><span className="pill" style={{ background: c.bg, color: c.text }}>{p.proyecto}</span></td>
                  <td className="hide-sm">{p.canal ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ChannelTile canal={p.canal} size={20} />{p.canal}</span> : <span className="muted">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(p.fecha)}</td>
                  <td><StatusBadge estado={p.estado} /></td>
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
      <div className="toolbar">
        <div className="segmented"><button className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>Este mes</button><button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Todo</button></div>
      </div>
      {pubs.length === 0 ? <div className="card"><Empty icon="list" title="No hay publicaciones">No hay publicaciones con estos filtros en este periodo.</Empty></div> : <PubTable pubs={pubs} />}
    </>
  )
}

// ── Visual Feed ───────────────────────────────────────────────────────────
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
        <span className="muted" style={{ fontSize: 12 }}>{list.length} publicaciones</span>
      </div>
      {list.length === 0 ? <div className="card"><Empty icon="grid" title="Nada que mostrar">No hay publicaciones de este tipo con los filtros actuales.</Empty></div> : (
        <>
          <div className="feed-grid">
            {list.slice(0, limit).map((p) => <FeedCard key={p.id} pub={p} onOpen={() => app.setSelectedPub(p)} />)}
          </div>
          {list.length > limit && <div style={{ textAlign: 'center', marginTop: 20 }}><button className="btn" onClick={() => setLimit((l) => l + 24)}>Cargar más</button></div>}
        </>
      )}
    </>
  )
}

export function FeedCard({ pub, onOpen }) {
  const n = splitMedia(pub.media).length
  return (
    <button className="feed-card" onClick={onOpen}>
      <div className="feed-media">
        <Cover media={firstMedia(pub)} tipo={pub.tipo} iconSize={34} />
        {pub.canal && <div className="feed-channel"><ChannelTile canal={pub.canal} size={26} onMedia /></div>}
        {n > 1 && <div className="feed-count">1/{n}</div>}
      </div>
      <div className="feed-body">
        <div className="feed-meta"><span>{fmtShort(pub.fecha)}</span><span>·</span><span className="trunc">{pub.proyecto}</span></div>
        <div className="feed-title">{pub.titulo || pub.proyecto}</div>
        <div><StatusBadge estado={pub.estado} /></div>
      </div>
    </button>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export default function PubViews() {
  const app = useApp()
  const { view } = app
  const searching = app.search.trim().length >= 2
  const titles = { calendar: 'Calendario', list: 'Publicaciones', feed: 'Visual Feed' }
  const subtitles = {
    calendar: 'Vista principal del calendario con publicaciones visuales, filtros y resumen mensual.',
    list: 'Listado completo de publicaciones con filtros avanzados.',
    feed: 'Vista tipo grid de todas las publicaciones.',
  }
  return (
    <>
      <PageHead title={titles[view]} subtitle={subtitles[view]}>
        <SyncButton />
        <CreateButton />
      </PageHead>
      <DemoBanner />
      <ErrorBanner />
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        {(view === 'calendar' || view === 'list') && !searching ? <MonthNav /> : <span />}
        <div className="toolbar" style={{ margin: 0 }}>
          {(view === 'calendar' || view === 'list') && <MonthSummary pubs={app.filteredPublications} />}
          <ViewSwitch />
        </div>
      </div>
      <div className="toolbar"><Filters /></div>
      {app.loading && app.publications.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>{[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 48, marginBottom: 10 }} />)}</div>
      ) : searching ? <SearchResults pubs={app.filteredPublications} /> : view === 'calendar' ? <CalendarView /> : view === 'list' ? <ListView /> : <FeedView />}
    </>
  )
}
