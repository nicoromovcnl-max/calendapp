import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { fmtLong, fmtShort, hashtagsOf, initials, projectColor, splitMedia } from '../lib/data.js'
import { ChannelTile, Cover, DemoBanner, Icon, Modal, PageHead, StatusBadge, stateDot, tipoIcon, useOutside } from './ui.jsx'

const TABS = [['posts', 'Posts', 'grid'], ['reels', 'Reels', 'video'], ['stories', 'Stories', 'story']]
const isStory = (p) => (p.tipo || '').toLowerCase() === 'historia'
const isReel = (p) => (p.tipo || '').toLowerCase() === 'reel'
const inTab = (p, tab) => (tab === 'reels' ? isReel(p) : tab === 'stories' ? isStory(p) : !isStory(p))

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

const richest = (projects) => (projects.length ? [...projects].sort((a, b) => b[1] - a[1])[0][0] : null)

// ── Teléfono: perfil con cuadrícula ───────────────────────────────────────
function Tile({ pub, tab, selected, onSelect, onOpen }) {
  const media = splitMedia(pub.media)
  const hasMedia = media.length > 0
  return (
    <button className={`ig-tile ${tab === 'stories' ? 'story' : ''} ${selected ? 'sel' : ''} ${hasMedia ? '' : 'text'}`}
      onClick={() => onSelect(pub)} onDoubleClick={() => onOpen(pub)} aria-pressed={selected} aria-label={`${pub.titulo || pub.proyecto}, ${fmtShort(pub.fecha)}`}>
      {hasMedia ? <Cover media={pub.media} tipo={pub.tipo} iconSize={26} showPlay={false} /> : <span className="ig-text">{pub.titulo || pub.proyecto}</span>}
      <span className="ig-badges">
        {isReel(pub) && <Icon name="video" size={15} />}
        {(pub.tipo || '') === 'carrusel' || media.length > 1 ? <Icon name="layers" size={15} /> : null}
      </span>
      <i className="ig-dot state-dot" style={{ '--dot': stateDot(pub.estado) }} title={pub.estado || 'Sin estado'} />
      <span className="ig-hover"><b>{pub.titulo || pub.proyecto}</b><small>{fmtShort(pub.fecha)}</small></span>
    </button>
  )
}

function Phone({ handle, label, projectName, counts, pubs, tab, setTab, selId, onSelect, onOpen, projects, onPickProject, hasStories, last, planned, emptyNote }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const c = projectColor(projectName || '')
  const list = pubs.filter((p) => inTab(p, tab))
  const igUrl = handle ? `https://www.instagram.com/${handle}/` : null
  return (
    <div className="ig-phone" aria-label="Previsualización del perfil">
      <div className="ig-screen">
        <i className="ig-island" />
        <div className="ig-top" ref={ref}>
          <button className="ig-user" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
            <span className="trunc">{label}</span><Icon name="down" size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          <span className="ig-top-icons" aria-hidden="true"><Icon name="plus" size={20} /><Icon name="list" size={20} /></span>
          {open && (
            <div className="popover" role="listbox" style={{ left: 12, right: 12, top: 'calc(100% - 4px)' }}>
              {projects.map(([name, n]) => (
                <button key={name} role="option" aria-selected={name === projectName} className={`pop-item ${name === projectName ? 'on' : ''}`} onClick={() => { onPickProject(name); setOpen(false) }}>
                  <span className="dot" style={{ background: projectColor(name).dot }} /><span className="trunc" style={{ textTransform: 'capitalize' }}>{name.toLowerCase()}</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ig-scroll">
          <div className="ig-profile">
            <button className={`ig-avatar ${hasStories ? 'ring' : ''}`} style={{ '--tint': c.bg, '--ink-tint': c.text }} onClick={() => hasStories && setTab('stories')} aria-label={hasStories ? 'Ver historias' : 'Avatar'} disabled={!hasStories}>
              <span>{projectName ? initials(projectName) : '?'}</span>
            </button>
            <div className="ig-stats">
              <div><b>{counts.posts}</b><span>publicaciones</span></div>
              <div><b>{counts.reels}</b><span>reels</span></div>
              <div><b>{counts.stories}</b><span>historias</span></div>
            </div>
          </div>
          <div className="ig-bio">
            <b style={{ textTransform: 'capitalize' }}>{projectName ? projectName.toLowerCase() : label}</b>
            {last && <span>Última publicación: {fmtShort(last)}</span>}
            <span>{planned === 0 ? emptyNote : `${planned} contenido${planned === 1 ? '' : 's'} planificado${planned === 1 ? '' : 's'} en tu calendario`}</span>
          </div>
          <div className="ig-actions">
            {igUrl ? <a href={igUrl} target="_blank" rel="noreferrer">Ver perfil</a> : <span aria-disabled="true">Ver perfil</span>}
            {handle ? <a href={`https://ig.me/m/${handle}`} target="_blank" rel="noreferrer">Mensaje</a> : <span aria-disabled="true">Mensaje</span>}
          </div>
          <div className="ig-tabs" role="tablist" aria-label="Contenido">
            {TABS.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={tab === k} aria-label={l} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon name={ic} size={20} /></button>)}
          </div>
          {list.length === 0 ? (
            <div className="ig-empty"><Icon name={tipoIcon[tab === 'reels' ? 'reel' : tab === 'stories' ? 'historia' : 'imagen']} size={26} /><b>Sin {tab === 'posts' ? 'posts' : tab === 'reels' ? 'reels' : 'historias'}</b><span>Nada planificado de este tipo en este perfil.</span></div>
          ) : (
            <div className="ig-grid">{list.map((p) => <Tile key={p.id} pub={p} tab={tab} selected={selId === p.id} onSelect={onSelect} onOpen={onOpen} />)}</div>
          )}
        </div>
        <div className="ig-nav" aria-hidden="true"><Icon name="grid" size={22} /><Icon name="search" size={22} /><Icon name="plus" size={22} /><Icon name="video" size={22} /><span className="ig-nav-avatar" style={{ background: c.bg, color: c.text }}>{projectName ? initials(projectName)[0] : '?'}</span></div>
      </div>
    </div>
  )
}

// ── Detalle de la publicación seleccionada ────────────────────────────────
function DetailPanel({ pub, onOpen, onEdit, onClose, sheet }) {
  const tags = hashtagsOf(pub.copy)
  return (
    <div className={sheet ? '' : 'panel feed-detail'}>
      <div className="fd-media"><Cover media={pub.media} tipo={pub.tipo} iconSize={40} /></div>
      <div className="fd-body">
        <div className="fd-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><StatusBadge estado={pub.estado} />{pub.canal && <span className="fd-canal"><ChannelTile canal={pub.canal} size={18} />{pub.canal}</span>}</div>
            <h3>{pub.titulo || pub.proyecto}</h3>
            <p className="muted" style={{ margin: 0 }}>{fmtLong(pub.fecha)}{pub.hora ? ` · ${pub.hora}` : ''}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar detalle"><Icon name="x" size={16} /></button>
        </div>
        {pub.copy && <p className="copy-block clamp-6">{pub.copy}</p>}
        {tags.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{tags.slice(0, 6).map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        <div className="fd-actions">
          <button className="btn btn-primary btn-block" style={{ height: 40 }} onClick={onOpen}><Icon name="external" size={15} /> Abrir detalle</button>
          <button className="btn btn-block" onClick={onEdit}><Icon name="edit" size={14} /> Editar publicación</button>
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export default function VisualFeed() {
  const app = useApp()
  const narrow = useNarrow()
  const { account, accounts } = app

  const projects = useMemo(() => {
    const m = new Map()
    app.publications.forEach((p) => { if (p.proyecto) m.set(p.proyecto, (m.get(p.proyecto) || 0) + 1) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [app.publications])

  const [project, setProject] = useState(() => (app.projectsFilter.length === 1 ? app.projectsFilter[0] : richest(projects)))
  const [tab, setTab] = useState('posts')
  const [selId, setSelId] = useState(null)
  useEffect(() => { if (!project && projects.length) setProject(richest(projects)) }, [project, projects])

  // La cuenta activa (compartida con la sidebar) manda sobre el proyecto local.
  const activeProject = account ? account.proyecto || null : project
  const handle = account?.handle || app.accountOf(activeProject)?.handle || null
  const label = handle ? `@${handle}` : (activeProject || 'perfil').toLowerCase()

  const pubs = useMemo(() => app.publications.filter((p) => p.proyecto === activeProject).sort((a, b) => (b.fecha || 0) - (a.fecha || 0)), [app.publications, activeProject])
  const counts = useMemo(() => ({ posts: pubs.filter((p) => !isStory(p)).length, reels: pubs.filter(isReel).length, stories: pubs.filter(isStory).length }), [pubs])
  const sel = pubs.find((p) => p.id === selId) || null
  useEffect(() => { setSelId(null) }, [activeProject, tab])

  const pickProject = (name) => { setProject(name); app.setActiveAccount(app.accountOf(name)?.id ?? null) }
  const est = (e) => pubs.filter((p) => (p.estado || '').toLowerCase() === e).length
  const last = pubs.length ? pubs.reduce((a, b) => ((a.fecha || 0) > (b.fecha || 0) ? a : b)).fecha : null
  const unlinked = !!account && !account.proyecto
  const openPub = (p) => app.setSelectedPub(p)

  const phone = (
    <Phone handle={handle} label={label} projectName={activeProject} counts={counts} pubs={pubs} tab={tab} setTab={setTab} selId={selId}
      onSelect={(p) => setSelId(p.id === selId && !narrow ? null : p.id)} onOpen={openPub} projects={projects} onPickProject={pickProject}
      hasStories={counts.stories > 0} last={last} planned={pubs.length}
      emptyNote={unlinked ? 'Asocia esta cuenta a un proyecto para ver su contenido.' : 'Todavía no hay contenido planificado.'} />
  )

  return (
    <div className="view-enter">
      <PageHead title="Visual Feed" subtitle="Previsualiza cómo queda el contenido de cada proyecto." />
      <DemoBanner />

      <div className="feed-controls">
        <div className="field">
          <label htmlFor="vf-proyecto">Proyecto</label>
          <select id="vf-proyecto" className="select" value={activeProject || ''} onChange={(e) => pickProject(e.target.value)} disabled={unlinked && !projects.length}>
            {!activeProject && <option value="">Sin proyecto</option>}
            {projects.map(([name, n]) => <option key={name} value={name}>{name} · {n}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vf-cuenta">Cuenta</label>
          <select id="vf-cuenta" className="select" value={account?.id || ''} onChange={(e) => app.setActiveAccount(e.target.value || null)}>
            <option value="">Según el proyecto</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>@{a.handle}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="label">Tipo de contenido</span>
          <div className="segmented" role="tablist" aria-label="Tipo de contenido">
            {TABS.map(([k, l, ic]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                <Icon name={ic} size={14} />{l}<span className="muted" style={{ fontWeight: 500 }}>{k === 'posts' ? counts.posts : k === 'reels' ? counts.reels : counts.stories}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="feed-stage">
        <aside className="feed-context">
          <h4>Resumen</h4>
          <dl className="kv" style={{ padding: 0 }}>
            <dt>Publicaciones</dt><dd>{pubs.length}</dd>
            <dt>Programadas</dt><dd><i className="state-dot" style={{ '--dot': stateDot('programado') }} />{est('programado')}</dd>
            <dt>Publicadas</dt><dd><i className="state-dot" style={{ '--dot': stateDot('publicado') }} />{est('publicado')}</dd>
            <dt>Borradores</dt><dd><i className="state-dot" style={{ '--dot': stateDot('borrador') }} />{est('borrador')}</dd>
            {last && (<><dt>Última</dt><dd>{fmtShort(last)}</dd></>)}
          </dl>
          {unlinked && (
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="vf-link">Asociar @{account.handle} a un proyecto</label>
              <select id="vf-link" className="select" value="" onChange={(e) => e.target.value && app.linkAccount(account.id, e.target.value)}>
                <option value="">Selecciona un proyecto…</option>
                {app.projectNames.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          )}
          <ul className="feed-tips">
            <li><Icon name="down" size={14} />Toca el nombre de usuario del teléfono para cambiar de proyecto.</li>
            <li><Icon name="image" size={14} />Toca una publicación para ver su detalle. Con doble clic la abres.</li>
          </ul>
        </aside>

        <div className="phone-stage">{phone}</div>

        {!narrow && (sel
          ? <DetailPanel pub={sel} onOpen={() => openPub(sel)} onEdit={() => app.requireAuth(() => app.setEditing(sel))} onClose={() => setSelId(null)} />
          : (
            <div className="panel feed-detail feed-detail-empty">
              <Icon name="image" size={28} />
              <b>Ningún contenido seleccionado</b>
              <span>Toca una publicación del teléfono para ver aquí su detalle.</span>
            </div>
          ))}
      </div>

      {sel && narrow && (
        <Modal onClose={() => setSelId(null)} size="narrow">
          <DetailPanel sheet pub={sel} onOpen={() => openPub(sel)} onEdit={() => app.requireAuth(() => app.setEditing(sel))} onClose={() => setSelId(null)} />
        </Modal>
      )}
    </div>
  )
}
