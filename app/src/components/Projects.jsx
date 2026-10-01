import { useMemo } from 'react'
import { useApp } from '../store.jsx'
import { projectColor, thumbOf } from '../lib/data.js'
import { prettyProject } from '../lib/projects.js'
import { ChannelTile, DemoBanner, Icon, Menu, PageHead, ProjectAvatar, firstMedia } from './ui.jsx'

export default function Projects() {
  const app = useApp()
  const list = useMemo(() => app.projectNames.filter((p) => app.matchesAccount(p)).map((name) => {
    const pubs = app.publications.filter((p) => p.proyecto === name)
    const media = pubs.filter((p) => thumbOf(firstMedia(p))).sort((a, b) => (b.fecha || 0) - (a.fecha || 0)).slice(0, 3).map(firstMedia)
    return { name, count: pubs.length, media, accounts: app.accountsOf(name) }
  }), [app.projectNames, app.publications, app.matchesAccount, app.accountsOf])
  const open = (name, view) => { app.setProjectsFilter([name]); app.setView(view) }

  return (
    <div className="view-enter">
      <PageHead title="Proyectos" subtitle="Cada proyecto puede tener una o varias cuentas sociales." />
      <DemoBanner />
      <div className="projects-grid">
        {list.map((p) => {
          const c = projectColor(p.name)
          const ig = p.accounts[0] ? `https://www.instagram.com/${p.accounts[0].handle}/` : null
          return (
            <div key={p.name} className="media-card project-card">
              <button className="mc-media" style={{ width: '100%', background: c.bg }} onClick={() => open(p.name, 'calendar')} aria-label={`Abrir ${p.name}`}>
                {p.media.length >= 3 ? <div className="mosaic">{p.media.map((m, i) => <img key={i} src={thumbOf(m)} alt="" loading="lazy" />)}</div>
                  : p.media.length > 0 ? <img src={thumbOf(p.media[0])} alt="" loading="lazy" />
                  : <span style={{ color: c.dot, fontWeight: 800, fontSize: 34, letterSpacing: '0.04em' }}>{p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}</span>}
              </button>
              <div className="project-foot">
                <ProjectAvatar name={p.name} size={34} />
                <div className="grow">
                  <b className="trunc">{prettyProject(p.name)}</b>
                  <small>{p.count} publicaci{p.count === 1 ? 'ón' : 'ones'}</small>
                </div>
                <Menu label={`Acciones de ${p.name}`} items={[
                  { label: 'Ver calendario', icon: 'calendar', onClick: () => open(p.name, 'calendar') },
                  { label: 'Ver Visual Feed', icon: 'grid', onClick: () => open(p.name, 'feed') },
                  { label: 'Ver peticiones', icon: 'inbox', onClick: () => { app.setReqFilter('all'); app.setView('requests') } },
                  ig && { label: 'Abrir Instagram', icon: 'external', href: ig },
                ]} />
              </div>
              <div className="project-accounts">
                {p.accounts.length === 0 ? <span className="muted">Sin cuentas asociadas</span> : p.accounts.map((a) => <span key={a.id} className="acct-chip"><ChannelTile canal={a.canal} size={14} />@{a.handle}</span>)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
