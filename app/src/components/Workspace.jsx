import { useMemo, useState } from 'react'
import { lsGet, lsRemove, lsSet } from '../lib/storage.js'
import { useApp } from '../store.jsx'
import { CHANNELS, MONTHS, MONTHS_SHORT, REQ_ESTADOS, TIPOS, fmtShort, instagramUrl, isPendingRequest, projectColor, splitMedia, thumbOf, timeAgo } from '../lib/data.js'
import { ChannelTile, Cover, Empty, Icon, PageHead, ProjectAvatar, StatusBadge, Thumb, firstMedia, tipoIcon } from './ui.jsx'
import { PUBLICATIONS_CSV, REQUESTS_CSV, SCRIPT_URL, INSTAGRAM_HANDLES } from '../lib/data.js'

// ═══ Proyectos ═══════════════════════════════════════════════════════════
export function Projects() {
  const app = useApp()
  const list = useMemo(() => app.projectNames.map((name) => {
    const pubs = app.publications.filter((p) => p.proyecto === name)
    const withMedia = pubs.filter((p) => thumbOf(firstMedia(p))).sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
    return { name, count: pubs.length, media: withMedia.slice(0, 3).map(firstMedia) }
  }), [app.projectNames, app.publications])

  const open = (name, view) => { app.setProjectsFilter([name]); app.setView(view) }
  return (
    <>
      <PageHead title="Proyectos" subtitle="Gestión de clientes y proyectos. Se crean automáticamente al usarlos en una publicación o petición." />
      <div className="projects-grid">
        {list.map((p) => {
          const c = projectColor(p.name)
          const ig = instagramUrl(p.name)
          return (
            <div key={p.name} className="card project-card">
              <button style={{ display: 'block', width: '100%' }} onClick={() => open(p.name, 'calendar')} aria-label={`Abrir ${p.name}`}>
                <div className="project-cover" style={{ background: c.bg }}>
                  {p.media.length >= 3 ? (
                    <div className="mosaic">{p.media.map((m, i) => <img key={i} src={thumbOf(m)} alt="" loading="lazy" />)}</div>
                  ) : p.media.length > 0 ? <img src={thumbOf(p.media[0])} alt="" loading="lazy" /> : (
                    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: c.dot, fontWeight: 800, fontSize: 34, letterSpacing: '0.04em' }}>{p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}</div>
                  )}
                </div>
              </button>
              <div className="project-info">
                <ProjectAvatar name={p.name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}><b className="trunc" style={{ textTransform: 'capitalize' }}>{p.name.toLowerCase()}</b><small>{p.count} publicaci{p.count === 1 ? 'ón' : 'ones'}</small></div>
              </div>
              <div className="project-actions">
                <button className="btn btn-sm" onClick={() => open(p.name, 'calendar')}><Icon name="calendar" size={13} /> Calendario</button>
                <button className="btn btn-sm" onClick={() => open(p.name, 'feed')}><Icon name="grid" size={13} /> Feed</button>
                {ig && <a className="btn btn-sm btn-ghost btn-icon" title="Instagram" href={ig} target="_blank" rel="noreferrer"><Icon name="external" size={14} /></a>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ═══ Biblioteca ══════════════════════════════════════════════════════════
export function Library() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [project, setProject] = useState('')
  const [kind, setKind] = useState('')
  const assets = useMemo(() => {
    const out = []
    app.sortedPublications.forEach((p) => splitMedia(p.media).forEach((m, i) => out.push({ key: `${p.id}-${i}`, url: m, pub: p })))
    return out.reverse()
  }, [app.sortedPublications])
  const rows = assets.filter((a) => (!project || a.pub.proyecto === project)
    && (!kind || (kind === 'video' ? /youtu|\.(mp4|mov|webm)/i.test(a.url) : !/youtu|\.(mp4|mov|webm)/i.test(a.url)))
    && (!q.trim() || (a.pub.titulo || '').toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <>
      <PageHead title="Biblioteca" subtitle={`Todos los archivos usados en tus publicaciones · ${assets.length} archivos`} />
      <div className="toolbar">
        <div className="search"><Icon name="search" size={15} /><input className="input" placeholder="Buscar por título…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select filters-select" value={project} onChange={(e) => setProject(e.target.value)}><option value="">Todos los proyectos</option>{[...new Set(assets.map((a) => a.pub.proyecto))].sort().map((p) => <option key={p}>{p}</option>)}</select>
        <select className="select filters-select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Imágenes y vídeos</option><option value="image">Solo imágenes</option><option value="video">Solo vídeos</option></select>
      </div>
      {rows.length === 0 ? <div className="card"><Empty icon="image" title="Sin archivos">Los archivos que subas a publicaciones y peticiones aparecerán aquí.</Empty></div> : (
        <div className="library-grid">
          {rows.slice(0, 120).map((a) => (
            <button key={a.key} className="asset" onClick={() => app.setSelectedPub(a.pub)}>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}><Cover media={a.url} tipo={a.pub.tipo} iconSize={26} /></div>
              <div className="cap">{a.pub.titulo || a.pub.proyecto}</div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ═══ Estadísticas ════════════════════════════════════════════════════════
const PERIODS = [['month', 'Este mes'], ['prev', 'Mes anterior'], ['90', 'Últimos 90 días'], ['year', 'Este año'], ['all', 'Todo']]

function periodRange(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (key === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59), 'day']
  if (key === 'prev') return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59), 'day']
  if (key === '90') return [new Date(y, m, now.getDate() - 89), new Date(y, m, now.getDate(), 23, 59, 59), 'month']
  if (key === 'year') return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59), 'month']
  return [null, null, 'month']
}

function AreaChart({ points }) {
  const [hover, setHover] = useState(null)
  const W = 960, H = 240, padL = 30, padB = 24, padT = 12, padR = 10
  const max = Math.max(1, ...points.map((p) => p.value))
  const niceMax = Math.ceil(max / 4) * 4 || 4
  const x = (i) => padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - padL - padR))
  const y = (v) => padT + (1 - v / niceMax) * (H - padT - padB)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = points.length ? `${line} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z` : ''
  const step = Math.ceil(points.length / 8)
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Publicaciones a lo largo del tiempo" onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--green)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--green)" stopOpacity="0" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (niceMax / 4) * i
          return <g key={i}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={padL - 6} y={y(v) + 4} fontSize="10" fill="var(--ink-3)" textAnchor="end">{Math.round(v)}</text></g>
        })}
        {area && <path d={area} fill="url(#ag)" />}
        {line && <path d={line} fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g key={p.label + i}>
            {i % step === 0 && <text x={x(i)} y={H - 6} fontSize="10" fill="var(--ink-3)" textAnchor="middle">{p.label}</text>}
            <rect x={x(i) - 8} y={padT} width="16" height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {hover != null && points[hover] && <circle cx={x(hover)} cy={y(points[hover].value)} r="4.5" fill="var(--green)" stroke="#fff" strokeWidth="2" />}
      </svg>
      {hover != null && points[hover] && (
        <div style={{ position: 'absolute', left: `${(x(hover) / W) * 100}%`, top: 0, transform: 'translate(-50%,-4px)', background: 'var(--ink)', color: '#fff', fontSize: 11.5, padding: '5px 9px', borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          <b>{points[hover].value}</b> {points[hover].value === 1 ? 'publicación' : 'publicaciones'} · {points[hover].full}
        </div>
      )}
    </div>
  )
}

function Bars({ rows, total }) {
  if (rows.length === 0) return <p className="muted" style={{ margin: 0 }}>Sin datos en este periodo.</p>
  return rows.map(([label, n, icon]) => (
    <div className="bar-row" key={label}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{icon}<span className="trunc" style={{ textTransform: 'capitalize' }}>{label}</span></span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / total) * 100}%` }} /></div>
      <span className="v">{Math.round((n / total) * 100)}%</span>
    </div>
  ))
}

export function Stats() {
  const app = useApp()
  const [period, setPeriod] = useState('month')
  const [from, to, bin] = periodRange(period)
  const pubs = useMemo(() => app.publications.filter((p) => p.fecha && (!from || (p.fecha >= from && p.fecha <= to))), [app.publications, from, to])
  const count = (fn) => pubs.filter(fn).length
  const est = (e) => (p) => (p.estado || '').toLowerCase() === e

  const points = useMemo(() => {
    if (pubs.length === 0 && !from) return []
    const [a, b] = from ? [from, to] : [new Date(Math.min(...pubs.map((p) => p.fecha))), new Date(Math.max(...pubs.map((p) => p.fecha)))]
    const out = []
    if (bin === 'day') {
      for (let d = new Date(a); d <= b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        out.push({ key: d.toDateString(), label: String(d.getDate()), full: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, value: 0 })
      }
      pubs.forEach((p) => { const i = out.findIndex((o) => o.key === p.fecha.toDateString()); if (i >= 0) out[i].value++ })
    } else {
      for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_SHORT[d.getMonth()], full: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, value: 0 })
      }
      pubs.forEach((p) => { const i = out.findIndex((o) => o.key === `${p.fecha.getFullYear()}-${p.fecha.getMonth()}`); if (i >= 0) out[i].value++ })
    }
    return out
  }, [pubs, from, to, bin])

  const tally = (fn) => {
    const m = new Map()
    pubs.forEach((p) => { const k = fn(p); m.set(k, (m.get(k) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const canales = tally((p) => p.canal || 'Sin canal').map(([k, n]) => [k, n, k === 'Sin canal' ? <Icon name="globe" size={16} key="i" /> : <ChannelTile canal={k} size={18} key="i" />])
  const tipos = tally((p) => p.tipo || 'imagen').map(([k, n]) => [k, n, <Icon name={tipoIcon[k] || 'image'} size={16} key="i" />])
  const proyectos = tally((p) => p.proyecto).slice(0, 5)
  const reqBy = REQ_ESTADOS.map((e) => [e, app.requests.filter((r) => (r.estado || 'Pendiente') === e).length]).filter(([, n]) => n > 0)

  const tiles = [
    ['Publicaciones', pubs.length], ['Programadas', count(est('programado'))], ['Publicadas', count(est('publicado'))], ['Peticiones por revisar', app.pendingCount],
  ]

  return (
    <>
      <PageHead title="Estadísticas" subtitle="Resumen de la actividad de contenido a partir de tus publicaciones y peticiones.">
        <select className="select filters-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Periodo">{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </PageHead>
      <div className="stats-row">{tiles.map(([l, n]) => <div key={l} className="card stat-tile"><b>{n}</b><span>{l}</span></div>)}</div>
      <div className="card card-pad">
        <h3 className="card-title">Publicaciones {bin === 'day' ? 'por día' : 'por mes'}</h3>
        {points.length ? <AreaChart points={points} /> : <p className="muted">Sin publicaciones en este periodo.</p>}
      </div>
      <div className="charts">
        <div className="card card-pad"><h3 className="card-title">Por canal</h3><Bars rows={canales} total={pubs.length || 1} /></div>
        <div className="card card-pad"><h3 className="card-title">Por tipo de contenido</h3><Bars rows={tipos} total={pubs.length || 1} /></div>
        <div className="card card-pad">
          <h3 className="card-title">Proyectos con más publicaciones</h3>
          {proyectos.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin datos en este periodo.</p> : proyectos.map(([name, n]) => {
            const latest = pubs.filter((p) => p.proyecto === name && thumbOf(firstMedia(p))).sort((a, b) => b.fecha - a.fecha)[0]
            return (
              <button key={name} className="top-row" onClick={() => { app.setProjectsFilter([name]); app.setView('calendar') }}>
                <Thumb media={latest && firstMedia(latest)} tipo="imagen" />
                <div style={{ flex: 1, minWidth: 0 }}><b className="trunc top-title" style={{ display: 'block', textTransform: 'capitalize' }}>{name.toLowerCase()}</b><small className="muted">{n} publicaci{n === 1 ? 'ón' : 'ones'}</small></div>
                <Icon name="right" size={14} />
              </button>
            )
          })}
        </div>
        <div className="card card-pad">
          <h3 className="card-title">Peticiones por estado</h3>
          {reqBy.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aún no hay peticiones.</p> : reqBy.map(([e, n]) => (
            <div key={e} className="row-item" style={{ padding: '10px 0' }}><StatusBadge estado={e} kind="req" /><span className="grow" /><b>{n}</b></div>
          ))}
        </div>
      </div>
    </>
  )
}

// ═══ Ajustes ═════════════════════════════════════════════════════════════
const TABS = [['cuenta', 'Cuenta'], ['equipo', 'Equipo'], ['proyectos', 'Proyectos'], ['integraciones', 'Integraciones'], ['notificaciones', 'Notificaciones']]
const NAME_KEY = 'pubcal_solicitante'

function Section({ title, sub, children }) {
  return <div className="card card-pad" style={{ marginBottom: 16 }}><h3 className="card-title" style={{ marginBottom: sub ? 2 : 16 }}>{title}</h3>{sub && <p className="muted" style={{ margin: '0 0 12px' }}>{sub}</p>}{children}</div>
}

export function Settings() {
  const app = useApp()
  const [tab, setTab] = useState('cuenta')
  const [name, setName] = useState(app.userName)
  const [saved, setSaved] = useState(false)
  const people = useMemo(() => {
    const m = new Map()
    app.requests.forEach((r) => { const k = (r.solicitante || '').trim(); if (!k) return; const e = m.get(k) || { name: k, n: 0, last: null }; e.n++; if (!e.last || r.fecha > e.last) e.last = r.fecha; m.set(k, e) })
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [app.requests])
  const pending = app.requests.filter(isPendingRequest)

  return (
    <>
      <PageHead title="Ajustes" subtitle="Configuración de cuenta, equipo e integraciones." />
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>{l}</button>)}</div>
      <div style={{ maxWidth: 820 }}>
        {tab === 'cuenta' && (
          <>
            <Section title="Tu perfil" sub="El nombre se usa al enviar o modificar peticiones.">
              <div className="field" style={{ maxWidth: 360 }}>
                <label htmlFor="s-name">Nombre</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="s-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} placeholder="Tu nombre" />
                  <button className="btn" onClick={() => { try { lsSet(NAME_KEY, name.trim()) } catch { /* */ } setSaved(true) }}>{saved ? 'Guardado' : 'Guardar'}</button>
                </div>
              </div>
            </Section>
            <Section title="Acceso del equipo" sub="Con acceso puedes crear y editar publicaciones y aprobar peticiones.">
              <div className="row-item" style={{ padding: 0, border: 0 }}>
                <div className="grow"><b>{app.isAuth ? 'Sesión de equipo activa' : 'Sin acceso de equipo'}</b><small>Rol: {app.isAuth ? 'Admin' : 'Solicitante'}</small></div>
                {app.isAuth ? <button className="btn" onClick={app.logout}><Icon name="logout" size={14} /> Cerrar sesión</button> : <button className="btn btn-primary" onClick={() => app.setShowAuth(true)}><Icon name="lock" size={14} /> Acceso del equipo</button>}
              </div>
            </Section>
            <Section title="Modo demo" sub="Explora la app con datos de ejemplo, sin tocar la hoja.">
              <div className="row-item" style={{ padding: 0, border: 0 }}>
                <div className="grow"><b>{app.demo ? 'Demo activado' : 'Demo desactivado'}</b></div>
                <button type="button" className={`switch ${app.demo ? 'on' : ''}`} onClick={() => (app.demo ? app.exitDemo() : app.enterDemo())} role="switch" aria-checked={app.demo} aria-label="Modo demo" />
              </div>
            </Section>
          </>
        )}

        {tab === 'equipo' && (
          <Section title="Equipo" sub="Personas que han enviado peticiones. El acceso de equipo se comparte mediante contraseña.">
            {people.length === 0 ? <p className="muted" style={{ margin: 0 }}>Todavía no hay solicitantes.</p> : people.map((p) => (
              <div key={p.name} className="row-item">
                <div className="avatar" style={{ background: 'var(--green-50)', color: 'var(--green-600)' }}>{p.name.slice(0, 1).toUpperCase()}</div>
                <div className="grow"><b>{p.name}</b><small>Última petición: {fmtShort(p.last)}</small></div>
                <span className="badge no-dot">{p.n} petici{p.n === 1 ? 'ón' : 'ones'}</span>
              </div>
            ))}
          </Section>
        )}

        {tab === 'proyectos' && (
          <Section title="Proyectos" sub="Se crean al usarlos en una publicación o petición.">
            {app.projectNames.map((p) => {
              const ig = instagramUrl(p)
              return (
                <div key={p} className="row-item">
                  <ProjectAvatar name={p} />
                  <div className="grow"><b style={{ textTransform: 'capitalize' }}>{p.toLowerCase()}</b><small>{app.publications.filter((x) => x.proyecto === p).length} publicaciones · {app.requests.filter((x) => x.proyecto === p).length} peticiones</small></div>
                  {ig && <a className="btn btn-sm" href={ig} target="_blank" rel="noreferrer">@{INSTAGRAM_HANDLES[p]} <Icon name="external" size={12} /></a>}
                </div>
              )
            })}
          </Section>
        )}

        {tab === 'integraciones' && (
          <>
            <Section title="Integraciones" sub="La conexión está fijada y no puede modificarse desde la app. Solo un administrador puede cambiarla.">
              <div className="row-item"><div className="integration-icon" style={{ background: '#0f9d58' }}><Icon name="sheet" size={20} /></div>
                <div className="grow"><b>Google Sheets · Publicaciones</b><small>Conectado · {app.lastSynced ? `sincronizado ${timeAgo(app.lastSynced)}` : 'pendiente de sincronizar'}</small></div>
                <a className="btn btn-sm" href={PUBLICATIONS_CSV} target="_blank" rel="noreferrer">Abrir hoja</a>
                <button className="btn btn-sm" onClick={() => app.loadPublications(true)}><Icon name="refresh" size={13} className={app.loading ? 'spin' : ''} /> Sincronizar</button></div>
              <div className="row-item"><div className="integration-icon" style={{ background: '#0f9d58' }}><Icon name="inbox" size={20} /></div>
                <div className="grow"><b>Google Sheets · Peticiones</b><small>Conectado</small></div>
                <a className="btn btn-sm" href={REQUESTS_CSV} target="_blank" rel="noreferrer">Abrir hoja</a></div>
              <div className="row-item"><div className="integration-icon" style={{ background: '#4285f4' }}><Icon name="code" size={20} /></div>
                <div className="grow"><b>Google Apps Script</b><small>Guarda peticiones, ediciones y archivos</small><div style={{ marginTop: 6 }}><code className="mono">…{SCRIPT_URL.slice(-28)}</code></div></div>
                <span className="badge green">Conectado</span></div>
            </Section>
            <Section title="Perfiles de Instagram" sub="Enlaces por proyecto usados en el detalle de publicaciones.">
              {Object.entries(INSTAGRAM_HANDLES).map(([proj, h]) => (
                <div key={proj} className="row-item" style={{ padding: '10px 0' }}><ChannelTile canal="Instagram" size={28} /><div className="grow"><b style={{ textTransform: 'capitalize' }}>{proj.toLowerCase()}</b><small>@{h}</small></div><a className="btn btn-sm btn-ghost" href={`https://www.instagram.com/${h}/`} target="_blank" rel="noreferrer">Abrir <Icon name="external" size={12} /></a></div>
              ))}
            </Section>
            <Section title="Columnas de la hoja" sub="La hoja de publicaciones necesita estas columnas.">
              <div className="table-wrap"><table className="table" style={{ pointerEvents: 'none' }}><thead><tr>{['Proyecto', 'Fecha', 'Título', 'Copy', 'Imagen/Video', 'Tipo'].map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody><tr>{['gastro league', '15/07/2026', 'Post verano', 'El copy…', 'https://…', 'imagen'].map((c) => <td key={c} className="muted">{c}</td>)}</tr></tbody></table></div>
            </Section>
          </>
        )}

        {tab === 'notificaciones' && (
          <Section title="Pendiente de revisar" sub="Peticiones que esperan una decisión del equipo.">
            {pending.length === 0 ? <p className="muted" style={{ margin: 0 }}>No hay peticiones pendientes.</p> : pending.map((r) => (
              <button key={r.id} className="top-row" onClick={() => { app.setReqFilter('pending'); app.setView('requests') }}>
                <Thumb media={splitMedia(r.contenido)[0]} tipo={r.tipo} />
                <div style={{ flex: 1, minWidth: 0 }}><b className="trunc" style={{ display: 'block' }}>{r.titulo}</b><small className="muted">{r.proyecto}{r.solicitante ? ` · ${r.solicitante}` : ''}</small></div>
                <StatusBadge estado={r.estado || 'Pendiente'} kind="req" />
              </button>
            ))}
          </Section>
        )}
      </div>
    </>
  )
}
