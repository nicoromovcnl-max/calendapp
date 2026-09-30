import { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { splitMedia } from '../lib/data.js'
import { Cover, DemoBanner, Empty, Icon, PageHead } from './ui.jsx'

const isVideo = (u) => /youtu|\.(mp4|mov|webm)/i.test(u)

export default function Library() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [project, setProject] = useState('')
  const [kind, setKind] = useState('')
  const assets = useMemo(() => {
    const out = []
    app.sortedPublications.filter((p) => app.matchesAccount(p.proyecto)).forEach((p) => splitMedia(p.media).forEach((m, i) => out.push({ key: `${p.id}-${i}`, url: m, pub: p })))
    return out.reverse()
  }, [app.sortedPublications, app.matchesAccount])
  const t = q.trim().toLowerCase()
  const rows = assets.filter((a) => (!project || a.pub.proyecto === project) && (!kind || (kind === 'video') === isVideo(a.url)) && (!t || (a.pub.titulo || '').toLowerCase().includes(t)))
  return (
    <div className="view-enter">
      <PageHead title="Biblioteca" subtitle={`Archivos usados en tus publicaciones · ${assets.length}`} />
      <DemoBanner />
      <div className="toolbar">
        <div className="search"><Icon name="search" size={15} /><input className="input" placeholder="Buscar por título…" aria-label="Buscar en la biblioteca" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select filters-select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Proyecto"><option value="">Todos los proyectos</option>{[...new Set(assets.map((a) => a.pub.proyecto))].sort().map((p) => <option key={p}>{p}</option>)}</select>
        <select className="select filters-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo"><option value="">Imágenes y vídeos</option><option value="image">Solo imágenes</option><option value="video">Solo vídeos</option></select>
      </div>
      {rows.length === 0 ? <div className="card"><Empty icon="image" title="Sin archivos">Los archivos que subas a publicaciones y peticiones aparecerán aquí.</Empty></div> : (
        <div className="library-grid">
          {rows.slice(0, 120).map((a) => (
            <button key={a.key} className="asset" onClick={() => app.setSelectedPub(a.pub)}>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}><Cover media={a.url} tipo={a.pub.tipo} iconSize={26} /></div>
              <div className="cap trunc">{a.pub.titulo || a.pub.proyecto}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
