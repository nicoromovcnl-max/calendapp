import { useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { projectColor } from '../lib/data.js'
import { Icon, useOutside } from './ui.jsx'
import logo from '../assets/logo_calendapp.png'
import favicon from '../assets/favicon.jpg'

const MAX_PROJECTS = 8

function NavItem({ icon, label, active, onClick, count, title }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} title={title || label}>
      <Icon name={icon} size={17} />
      <span className="txt">{label}</span>
      {count > 0 && <span className="count">{count}</span>}
    </button>
  )
}

export function UserMenu({ up = true }) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const name = app.userName || (app.isAuth ? 'Equipo' : 'Invitado')
  const role = app.isAuth ? 'Admin' : 'Solicitante'
  return (
    <div className="user-card" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)}>
        <div className="avatar" style={{ background: 'var(--green-50)', color: 'var(--green-600)' }}>{name.slice(0, 1).toUpperCase()}</div>
        <div className="user-meta"><b>{name}</b><span>{role}</span></div>
      </button>
      {open && (
        <div className={`popover ${up ? 'up' : ''}`} style={{ left: 0, right: 0, minWidth: 210 }}>
          {app.isAuth ? (
            <button className="pop-item" onClick={() => { app.logout(); setOpen(false) }}><Icon name="logout" size={15} /> Cerrar sesión de equipo</button>
          ) : (
            <button className="pop-item" onClick={() => { app.setShowAuth(true); setOpen(false) }}><Icon name="lock" size={15} /> Acceso del equipo</button>
          )}
          {app.demo ? (
            <button className="pop-item" onClick={() => { app.exitDemo(); setOpen(false) }}><Icon name="x" size={15} /> Salir del modo demo</button>
          ) : (
            <button className="pop-item" onClick={() => { app.enterDemo(); setOpen(false) }}><Icon name="flame" size={15} /> Ver modo demo</button>
          )}
          <button className="pop-item" onClick={() => { app.setView('settings'); setOpen(false) }}><Icon name="sliders" size={15} /> Ajustes</button>
          <a className="pop-item" href="./help.html"><Icon name="info" size={15} /> Ayuda</a>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const app = useApp()
  const { view, reqFilter, sidebarCollapsed: collapsed } = app
  const goPubs = (v) => { app.setView(v) }
  const projectCounts = {}
  app.publications.forEach((p) => { projectCounts[p.proyecto] = (projectCounts[p.proyecto] || 0) + 1 })
  const projects = app.projectNames
  const shown = projects.slice(0, MAX_PROJECTS)
  const toggleProject = (p) => {
    app.setProjectsFilter(app.projectsFilter.length === 1 && app.projectsFilter[0] === p ? [] : [p])
    if (!['calendar', 'list', 'feed'].includes(view)) app.setView('calendar')
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        {collapsed ? <img src={favicon} alt="CalendApp" width="30" height="30" style={{ borderRadius: 8 }} /> : <img src={logo} alt="CalendApp · by El Chandrio Group" style={{ height: 30, width: 'auto' }} />}
        <button className="collapse" onClick={() => app.setSidebarCollapsed(!collapsed)} title={collapsed ? 'Expandir' : 'Contraer'} aria-label="Contraer barra lateral">
          <Icon name="panel" size={16} />
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="nav-label">CONTENIDO</div>
        <NavItem icon="calendar" label="Calendario" active={view === 'calendar'} onClick={() => goPubs('calendar')} />
        <NavItem icon="list" label="Lista" active={view === 'list'} onClick={() => goPubs('list')} />
        <NavItem icon="grid" label="Visual Feed" active={view === 'feed'} onClick={() => goPubs('feed')} />

        <div className="nav-label">PETICIONES</div>
        <NavItem icon="inbox" label="Peticiones" active={view === 'requests' && reqFilter === 'all'} onClick={() => { app.setReqFilter('all'); app.setView('requests') }} />
        <NavItem icon="clock" label="Pendientes" count={app.pendingCount} active={view === 'requests' && reqFilter === 'pending'} onClick={() => { app.setReqFilter('pending'); app.setView('requests') }} />

        <div className="projects-block">
          <div className="nav-label">
            <span>PROYECTOS</span>
            <button onClick={() => app.setView('projects')}>Ver todos</button>
          </div>
          {shown.map((p) => (
            <button key={p} className={`nav-item ${app.projectsFilter.includes(p) ? 'active' : ''}`} onClick={() => toggleProject(p)} title={p}>
              <span className="dot" style={{ background: projectColor(p).dot }} />
              <span className="txt" style={{ textTransform: 'capitalize' }}>{p.toLowerCase()}</span>
              {projectCounts[p] > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)', fontWeight: 600 }}>{projectCounts[p]}</span>}
            </button>
          ))}
          {projects.length > MAX_PROJECTS && (
            <button className="nav-item" onClick={() => app.setView('projects')} style={{ color: 'var(--ink-3)' }}>
              <Icon name="more" size={17} /><span className="txt">{projects.length - MAX_PROJECTS} más</span>
            </button>
          )}
        </div>

        <div className="nav-label">ESPACIO DE TRABAJO</div>
        <NavItem icon="image" label="Biblioteca" active={view === 'library'} onClick={() => app.setView('library')} />
        <NavItem icon="chart" label="Estadísticas" active={view === 'stats'} onClick={() => app.setView('stats')} />
        <NavItem icon="sliders" label="Ajustes" active={view === 'settings'} onClick={() => app.setView('settings')} />
      </div>

      <UserMenu />
    </aside>
  )
}

export function MobileBar() {
  const app = useApp()
  const [more, setMore] = useState(false)
  const items = [
    ['calendar', 'calendar', 'Calendario'], ['list', 'list', 'Lista'], ['feed', 'grid', 'Feed'], ['requests', 'inbox', 'Peticiones'],
  ]
  const extra = [['projects', 'folder', 'Proyectos'], ['library', 'image', 'Biblioteca'], ['stats', 'chart', 'Estadísticas'], ['settings', 'sliders', 'Ajustes']]
  return (
    <>
      {more && (
        <div className="overlay mobile-only" style={{ alignItems: 'flex-end', padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="dialog narrow" style={{ paddingBottom: 90, borderRadius: '20px 20px 0 0' }}>
            <div style={{ padding: 12 }}>
              {extra.map(([v, ic, label]) => (
                <button key={v} className={`nav-item ${app.view === v ? 'active' : ''}`} style={{ padding: 12 }} onClick={() => { app.setView(v); setMore(false) }}><Icon name={ic} size={18} /> {label}</button>
              ))}
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}><UserMenu up={false} /></div>
            </div>
          </div>
        </div>
      )}
      <nav className="mobile-bar" aria-label="Navegación">
        {items.map(([v, ic, label]) => (
          <button key={v} className={app.view === v ? 'on' : ''} onClick={() => { if (v === 'requests') app.setReqFilter('all'); app.setView(v) }}>
            <Icon name={ic} size={20} />{label}
            {v === 'requests' && app.pendingCount > 0 && <span className="count">{app.pendingCount}</span>}
          </button>
        ))}
        <button className={extra.some(([v]) => v === app.view) ? 'on' : ''} onClick={() => setMore((m) => !m)}><Icon name="more" size={20} />Más</button>
      </nav>
    </>
  )
}
