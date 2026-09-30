import { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { PUBLICATIONS_CSV, REQUESTS_CSV, SCRIPT_URL, fmtShort, isPendingRequest, splitMedia, timeAgo } from '../lib/data.js'
import { lsSet } from '../lib/storage.js'
import { ChannelTile, DemoBanner, Icon, PageHead, ProjectAvatar, StatusBadge, Thumb } from './ui.jsx'

const TABS = [['cuenta', 'Cuenta'], ['equipo', 'Equipo'], ['proyectos', 'Proyectos'], ['integraciones', 'Integraciones'], ['notificaciones', 'Notificaciones']]
const NAME_KEY = 'pubcal_solicitante'

function Group({ title, sub, children }) {
  return (
    <section className="settings-group">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      <div className="panel divided">{children}</div>
    </section>
  )
}

const Row = ({ icon, title, sub, children }) => (
  <div className="row-item">
    {icon}
    <div className="grow"><b>{title}</b>{sub && <small>{sub}</small>}</div>
    {children}
  </div>
)

function AddAccount() {
  const app = useApp()
  const [v, setV] = useState('')
  return (
    <form className="row-item" onSubmit={(e) => { e.preventDefault(); if (app.addAccount(v)) setV('') }}>
      <input className="input" placeholder="@usuario de la cuenta" aria-label="Usuario de la cuenta" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn" type="submit" disabled={!v.trim()}><Icon name="plus" size={14} /> Añadir cuenta</button>
    </form>
  )
}

export default function Settings() {
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
    <div className="view-enter">
      <PageHead title="Ajustes" subtitle="Cuenta, equipo, proyectos e integraciones." />
      <DemoBanner />
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>{l}</button>)}</div>
      <div className="settings-body">
        {tab === 'cuenta' && (
          <>
            <Group title="Perfil" sub="Tu nombre se usa al enviar o modificar peticiones.">
              <div className="row-item">
                <div className="grow"><div className="field"><label htmlFor="s-name">Nombre</label><input id="s-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} placeholder="Tu nombre" /></div></div>
                <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => { lsSet(NAME_KEY, name.trim()); setSaved(true) }}>{saved ? 'Guardado' : 'Guardar'}</button>
              </div>
            </Group>
            <Group title="Acceso" sub="El acceso del equipo permite crear y editar publicaciones y aprobar peticiones.">
              <Row title={app.isAuth ? 'Acceso de equipo activo' : 'Sin acceso de equipo'} sub={`Rol: ${app.isAuth ? 'Admin' : 'Solicitante'}`}>
                {app.isAuth ? <button className="btn" onClick={app.logout}><Icon name="logout" size={14} /> Cerrar sesión</button> : <button className="btn btn-primary" onClick={() => app.setShowAuth(true)}><Icon name="lock" size={14} /> Acceso del equipo</button>}
              </Row>
              <Row title="Modo demo" sub="Explora la app con datos de ejemplo, sin tocar la hoja.">
                <button type="button" className={`switch ${app.demo ? 'on' : ''}`} onClick={() => (app.demo ? app.exitDemo() : app.enterDemo())} role="switch" aria-checked={app.demo} aria-label="Modo demo" />
              </Row>
            </Group>
          </>
        )}

        {tab === 'equipo' && (
          <Group title="Equipo" sub="Personas que han enviado peticiones. El acceso de equipo se comparte con una contraseña.">
            {people.length === 0 ? <Row title="Todavía no hay solicitantes" /> : people.map((p) => (
              <Row key={p.name} icon={<div className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>{p.name.slice(0, 1).toUpperCase()}</div>} title={p.name} sub={`Última petición: ${fmtShort(p.last)}`}>
                <span className="badge no-dot">{p.n} petici{p.n === 1 ? 'ón' : 'ones'}</span>
              </Row>
            ))}
          </Group>
        )}

        {tab === 'proyectos' && (
          <Group title="Proyectos" sub="Se crean al usarlos en una publicación o petición.">
            {app.projectNames.map((p) => {
              const acc = app.accountOf(p)
              return (
                <Row key={p} icon={<ProjectAvatar name={p} />} title={<span style={{ textTransform: 'capitalize' }}>{p.toLowerCase()}</span>} sub={`${app.publications.filter((x) => x.proyecto === p).length} publicaciones · ${app.requests.filter((x) => x.proyecto === p).length} peticiones`}>
                  {acc && <span className="badge no-dot">@{acc.handle}</span>}
                </Row>
              )
            })}
          </Group>
        )}

        {tab === 'integraciones' && (
          <>
            <Group title="Datos" sub="La conexión está fijada y no puede modificarse desde la app. Solo un administrador puede cambiarla.">
              <Row icon={<div className="integration-icon" style={{ background: '#0f9d58' }}><Icon name="sheet" size={19} /></div>} title="Google Sheets · Publicaciones" sub={app.lastSynced ? `Sincronizado ${timeAgo(app.lastSynced)}` : 'Pendiente de sincronizar'}>
                <a className="btn btn-sm" href={PUBLICATIONS_CSV} target="_blank" rel="noreferrer">Abrir</a>
                <button className="btn btn-sm" onClick={() => app.loadPublications(true)}><Icon name="refresh" size={13} className={app.loading ? 'spin' : ''} /> Sincronizar</button>
              </Row>
              <Row icon={<div className="integration-icon" style={{ background: '#0f9d58' }}><Icon name="inbox" size={19} /></div>} title="Google Sheets · Peticiones" sub="Conectado">
                <a className="btn btn-sm" href={REQUESTS_CSV} target="_blank" rel="noreferrer">Abrir</a>
              </Row>
              <Row icon={<div className="integration-icon" style={{ background: '#4285f4' }}><Icon name="code" size={19} /></div>} title="Google Apps Script" sub={<code className="mono">…{SCRIPT_URL.slice(-26)}</code>}>
                <span className="badge green">Conectado</span>
              </Row>
            </Group>
            <Group title="Cuentas" sub="Se usan para filtrar y etiquetar el contenido. Puedes añadir las que necesites.">
              {app.accounts.map((a) => (
                <Row key={a.id} icon={<ChannelTile canal={a.canal} size={38} />} title={`@${a.handle}`} sub={a.proyecto ? `Proyecto: ${a.proyecto.toLowerCase()}` : 'Sin proyecto asociado'}>
                  <a className="btn btn-sm btn-ghost" href={`https://www.instagram.com/${a.handle}/`} target="_blank" rel="noreferrer">Abrir <Icon name="external" size={12} /></a>
                </Row>
              ))}
              <AddAccount />
            </Group>
            <section className="settings-group">
              <div className="panel"><details className="plain"><summary>Columnas de la hoja de publicaciones <Icon name="down" size={15} className="muted" /></summary>
                <div className="table-wrap"><table className="table" style={{ pointerEvents: 'none' }}><thead><tr>{['Proyecto', 'Fecha', 'Título', 'Copy', 'Imagen/Video', 'Tipo'].map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody><tr>{['gastro league', '15/07/2026', 'Post verano', 'El copy…', 'https://…', 'imagen'].map((c) => <td key={c} className="muted" style={{ height: 48 }}>{c}</td>)}</tr></tbody></table></div>
              </details></div>
            </section>
          </>
        )}

        {tab === 'notificaciones' && (
          <Group title="Pendiente de revisar" sub="Peticiones que esperan una decisión del equipo.">
            {pending.length === 0 ? <Row title="No hay peticiones pendientes" /> : pending.map((r) => (
              <button key={r.id} className="row-item" style={{ width: '100%', textAlign: 'left' }} onClick={() => { app.setReqFilter('pending'); app.setView('requests') }}>
                <Thumb media={splitMedia(r.contenido)[0]} tipo={r.tipo} project={r.proyecto} />
                <div className="grow"><b className="trunc">{r.titulo}</b><small>{r.proyecto}{r.solicitante ? ` · ${r.solicitante}` : ''}</small></div>
                <StatusBadge estado={r.estado || 'Pendiente'} kind="req" />
              </button>
            ))}
          </Group>
        )}
      </div>
    </div>
  )
}
