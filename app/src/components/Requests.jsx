import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { PRIORIDADES, REQ_ESTADOS, fmtFull, fmtShort, isPendingRequest, splitMedia } from '../lib/data.js'
import { ChannelTile, DemoBanner, Empty, Icon, Kpis, Modal, PageHead, PriorityLabel, ProjectPill, StatusBadge, Thumb, tipoIcon } from './ui.jsx'

function useNarrow(q = '(max-width: 820px)') {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const h = (e) => setM(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}

function RequestPanel({ req, onClose, inModal }) {
  const app = useApp()
  const files = splitMedia(req.contenido)
  const approved = req.estado === 'Aprobado'
  const rejected = req.estado === 'Rechazado'
  const linked = approved ? app.publications.find((p) => p.id === `approved-${req.id}` || (p.proyecto === req.proyecto && p.titulo === req.titulo)) : null
  const promo = (req.promocionado || '').toLowerCase().startsWith('s')

  const createPublication = () => app.requireAuth(async () => { await app.changeRequestState(req, 'Aprobado') })
  const goCalendar = () => {
    if (req.fecha) { app.setYear(req.fecha.getFullYear()); app.setMonth(req.fecha.getMonth()) }
    if (linked) app.setSelectedPub(linked)
    app.setView('calendar')
    if (linked) app.setSelectedPub(linked)
  }

  return (
    <div className={inModal ? '' : 'panel side-panel'}>
      <div className="panel-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 8 }}><ProjectPill name={req.proyecto} /></div>
          <h3>{req.titulo || 'Sin título'}</h3>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
      </div>

      <dl className="kv">
        <dt>Estado</dt><dd><StatusBadge estado={req.estado || 'Pendiente'} kind="req" /></dd>
        <dt>Prioridad</dt><dd><PriorityLabel prioridad={req.prioridad} /></dd>
        <dt>Fecha</dt><dd>{fmtFull(req.fecha)}</dd>
        <dt>Responsable</dt><dd>{req.solicitante || <span className="muted">Sin asignar</span>}</dd>
        {req.canal && (<><dt>Canal</dt><dd style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ChannelTile canal={req.canal} size={20} />{req.canal}</dd></>)}
        {promo && (<><dt>Campaña Ads</dt><dd>Sí{req.presupuesto ? ` · ${req.presupuesto} €` : ''}</dd></>)}
      </dl>

      <div className="panel-section">
        <h4>Descripción</h4>
        {req.info ? <p className="copy-block" style={{ margin: 0 }}>{req.info}</p> : <p className="muted" style={{ margin: 0 }}>Sin descripción.</p>}
      </div>

      <div className="panel-section">
        <h4>Entregables</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: files.length ? 10 : 0, textTransform: 'capitalize', fontWeight: 600 }}>
          <Icon name={tipoIcon[req.tipo] || 'image'} size={15} /> {req.tipo || 'imagen'}
        </div>
        {files.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Sin archivos adjuntos</span> : (
          <div className="media-strip">
            {files.map((f, i) => <a key={f + i} href={f} target="_blank" rel="noreferrer" title="Abrir archivo"><Thumb media={f} tipo={req.tipo} size="lg" /></a>)}
          </div>
        )}
      </div>

      <div className="panel-actions">
        {approved ? (
          <>
            <div className="banner demo" style={{ margin: 0 }}><Icon name="check" size={15} /><span className="grow">Esta petición ya es una publicación del calendario.</span></div>
            <button className="btn btn-primary btn-block" onClick={goCalendar}><Icon name="calendar" size={15} /> Ver en el calendario</button>
          </>
        ) : rejected ? (
          <div className="muted" style={{ fontSize: 13 }}>Petición rechazada. Puedes editarla para cambiar su estado.</div>
        ) : (
          <button className="btn btn-accent btn-block" style={{ height: 40 }} onClick={createPublication}>
            <Icon name={app.isAuth ? 'plus' : 'lock'} size={15} /> Crear publicación
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => app.setRequestEdit(req)}><Icon name="edit" size={14} /> Editar</button>
          {app.isAuth && !approved && !rejected && <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => app.changeRequestState(req, 'Rechazado')}><Icon name="x" size={14} /> Rechazar</button>}
          <button className="btn btn-danger btn-icon" onClick={() => app.setRequestDelete(req)} aria-label="Eliminar"><Icon name="trash" size={14} /></button>
        </div>
        {!app.isAuth && !approved && !rejected && <span className="muted" style={{ fontSize: 12 }}>Solo el equipo puede crear la publicación.</span>}
      </div>
    </div>
  )
}

export default function Requests() {
  const app = useApp()
  const narrow = useNarrow()
  const { requests } = app
  const [q, setQ] = useState('')
  const [proyecto, setProyecto] = useState('')
  const [estado, setEstado] = useState(app.reqFilter === 'pending' ? 'pending' : '')
  const [prioridad, setPrioridad] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  useEffect(() => { setEstado(app.reqFilter === 'pending' ? 'pending' : '') }, [app.reqFilter])

  const count = (fn) => requests.filter(fn).length
  const tiles = [
    ['Pendientes', 'Pendiente', count((r) => (r.estado || 'Pendiente') === 'Pendiente')],
    ['En revisión', 'En revisión', count((r) => r.estado === 'En revisión')],
    ['Aprobadas', 'Aprobado', count((r) => r.estado === 'Aprobado')],
    ['Rechazadas', 'Rechazado', count((r) => r.estado === 'Rechazado')],
  ]

  const projects = useMemo(() => [...new Set(requests.map((r) => r.proyecto))].sort(), [requests])
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return [...requests]
      .filter((r) => app.matchesAccount(r.proyecto) && (!proyecto || r.proyecto === proyecto)
        && (!estado || (estado === 'pending' ? isPendingRequest(r) : (r.estado || 'Pendiente') === estado))
        && (!prioridad || r.prioridad === prioridad)
        && (!t || [r.titulo, r.info, r.solicitante, r.proyecto].some((f) => f && f.toLowerCase().includes(t))))
      .sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
  }, [requests, q, proyecto, estado, prioridad, app.matchesAccount])

  const selected = requests.find((r) => r.id === selectedId) || null
  useEffect(() => { if (selectedId && !selected) setSelectedId(null) }, [selectedId, selected])

  return (
    <div className="view-enter">
      <PageHead title="Peticiones" subtitle="Solicitudes de contenido de todos tus proyectos, con estado, prioridad y detalle.">
        <button className="btn btn-icon" onClick={app.loadRequests} title="Actualizar" aria-label="Actualizar"><Icon name="refresh" size={15} className={app.requestsLoading ? 'spin' : ''} /></button>
        <button className="btn btn-primary" onClick={() => app.setRequestForm(true)}><Icon name="plus" size={15} /> Nueva petición</button>
      </PageHead>
      <DemoBanner />

      <Kpis items={tiles.map(([label, key, value]) => ({ label, value, active: estado === key, onClick: () => setEstado(estado === key ? '' : key) }))} />

      <div className="toolbar">
        <div className="search"><Icon name="search" size={15} /><input className="input" placeholder="Buscar peticiones…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select filters-select" value={proyecto} onChange={(e) => setProyecto(e.target.value)}><option value="">Todos los proyectos</option>{projects.map((p) => <option key={p}>{p}</option>)}</select>
        <select className="select filters-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option><option value="pending">Por revisar</option>{REQ_ESTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="select filters-select" value={prioridad} onChange={(e) => setPrioridad(e.target.value)}><option value="">Prioridad</option>{PRIORIDADES.map((p) => <option key={p}>{p}</option>)}</select>
      </div>

      <div className={`split ${selected && !narrow ? 'with-panel' : ''}`}>
        <div className="panel">
          {rows.length === 0 ? (
            <Empty icon="inbox" title={requests.length === 0 ? 'Aún no hay peticiones' : 'Sin resultados'}>
              {requests.length === 0 ? 'Cuando alguien solicite contenido, aparecerá aquí.' : 'Prueba a cambiar los filtros.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className={`table ${selected && !narrow ? 'compact' : ''}`}>
                <thead><tr><th>Solicitud</th><th className="hide-sm hide-compact">Proyecto</th><th className="col-prio">Prioridad</th><th className="col-state">Estado</th><th className="hide-sm hide-compact">Fecha</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={selectedId === r.id ? 'selected' : ''} onClick={() => setSelectedId(r.id)}>
                      <td><div className="cell-main"><Thumb media={splitMedia(r.contenido)[0]} tipo={r.tipo} /><div style={{ minWidth: 0 }}><b className="trunc">{r.titulo}</b><small>{selected && !narrow ? `${r.proyecto} · ` : ''}{r.solicitante ? `por ${r.solicitante}` : r.tipo}</small><small className="cell-sub-mobile">{r.prioridad || 'Media'} · {fmtShort(r.fecha)}</small></div></div></td>
                      <td className="hide-sm hide-compact">{r.proyecto}</td>
                      <td className="col-prio"><PriorityLabel prioridad={r.prioridad} /></td>
                      <td><StatusBadge estado={r.estado || 'Pendiente'} kind="req" /></td>
                      <td className="hide-sm hide-compact" style={{ whiteSpace: 'nowrap' }}>{fmtShort(r.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selected && !narrow && <RequestPanel req={selected} onClose={() => setSelectedId(null)} />}
      </div>
      {selected && narrow && <Modal onClose={() => setSelectedId(null)} size="narrow"><RequestPanel req={selected} onClose={() => setSelectedId(null)} inModal /></Modal>}
    </div>
  )
}
