import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { fmtLong, hashtagsOf, instagramUrl, isVideoUrl, projectColor, splitMedia, thumbOf } from '../lib/data.js'
import { ChannelTile, Cover, Icon, ProjectPill, StatusBadge } from './ui.jsx'

function Section({ title, children }) {
  return <div className="panel-section" style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}><h4>{title}</h4>{children}</div>
}

function fileLabel(url, i) {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m) return `Archivo ${i + 1} · Drive`
  if (url.includes('youtu')) return `Vídeo ${i + 1} · YouTube`
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || url) || url } catch { return url }
}

export default function PublicationDetail() {
  const app = useApp()
  const pub = app.selectedPub
  const list = app.sortedPublications
  const idx = list.findIndex((p) => p.id === pub.id)
  const media = useMemo(() => splitMedia(pub.media), [pub.media])
  const [active, setActive] = useState(0)
  useEffect(() => setActive(0), [pub.id])
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || app.editing) return
      if (e.key === 'Escape') app.setSelectedPub(null)
      if (e.key === 'ArrowLeft' && idx > 0) app.setSelectedPub(list[idx - 1])
      if (e.key === 'ArrowRight' && idx < list.length - 1) app.setSelectedPub(list[idx + 1])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  const tags = hashtagsOf(pub.copy)
  const ig = instagramUrl(pub.proyecto)
  const current = media[active] || ''
  const promocionado = (pub.promocionado || '').toLowerCase().startsWith('s')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <button className="back" onClick={() => app.setSelectedPub(null)}><Icon name="arrowLeft" size={16} /> Volver</button>
        <div className="page-actions">
          <button className="btn btn-icon" disabled={idx <= 0} onClick={() => app.setSelectedPub(list[idx - 1])} aria-label="Anterior"><Icon name="left" size={15} /></button>
          <button className="btn btn-icon" disabled={idx < 0 || idx >= list.length - 1} onClick={() => app.setSelectedPub(list[idx + 1])} aria-label="Siguiente"><Icon name="right" size={15} /></button>
          <button className="btn btn-primary" onClick={() => app.requireAuth(() => app.setEditing(pub))}><Icon name="edit" size={14} /> Editar</button>
        </div>
      </div>

      <div className="detail">
        <div>
          <div className="detail-hero">
            <Cover media={current} tipo={pub.tipo} iconSize={48} />
            {isVideoUrl(current) && <a href={current} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ position: 'absolute', bottom: 12, right: 12 }}><Icon name="external" size={13} /> Abrir vídeo</a>}
          </div>
          {media.length > 1 && (
            <div className="detail-thumbs">
              {media.map((m, i) => (
                <button key={m + i} className={i === active ? 'on' : ''} onClick={() => setActive(i)} aria-label={`Archivo ${i + 1}`}>
                  {thumbOf(m) ? <img src={thumbOf(m)} alt="" /> : <Icon name="image" size={18} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <ProjectPill name={pub.proyecto} />
              <StatusBadge estado={pub.estado} />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{pub.titulo || pub.proyecto}</h1>
            <p className="muted" style={{ margin: '6px 0 0' }}>{fmtLong(pub.fecha)}</p>

            <Section title="Contenido">
              {pub.copy ? <p className="copy-block" style={{ margin: 0 }}>{pub.copy}</p> : <p className="muted" style={{ margin: 0 }}>Sin texto.</p>}
            </Section>

            <Section title="Canal">
              {pub.canal ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}><ChannelTile canal={pub.canal} size={28} />{pub.canal}<span className="muted" style={{ fontWeight: 500, textTransform: 'capitalize' }}>· {pub.tipo || 'imagen'}</span></div> : <span className="muted">Sin canal asignado</span>}
            </Section>

            {tags.length > 0 && <Section title="Etiquetas"><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div></Section>}

            {media.length > 0 && (
              <Section title={`Archivos (${media.length})`}>
                <div className="link-list">{media.map((m, i) => <a key={m + i} href={m} target="_blank" rel="noreferrer"><Icon name="link" size={14} /> <span>{fileLabel(m, i)}</span></a>)}</div>
              </Section>
            )}

            <Section title="Información">
              <dl className="kv" style={{ padding: 0, margin: 0 }}>
                <dt>Proyecto</dt><dd>{pub.proyecto}</dd>
                <dt>Fecha</dt><dd >{fmtLong(pub.fecha)}</dd>
                <dt>Tipo</dt><dd style={{ textTransform: 'capitalize' }}>{pub.tipo || 'imagen'}</dd>
                {pub.solicitante && (<><dt>Responsable</dt><dd>{pub.solicitante}</dd></>)}
                {promocionado && (<><dt>Campaña Ads</dt><dd>Sí{pub.presupuesto ? ` · ${pub.presupuesto} €` : ''}</dd></>)}
                {pub.url_post && (<><dt>Publicación</dt><dd><a href={pub.url_post} target="_blank" rel="noreferrer" style={{ color: 'var(--green-600)' }}>Ver publicada <Icon name="external" size={12} /></a></dd></>)}
                {ig && (<><dt>Perfil</dt><dd><a href={ig} target="_blank" rel="noreferrer" style={{ color: 'var(--green-600)' }}>@{ig.split('/').filter(Boolean).pop()} <Icon name="external" size={12} /></a></dd></>)}
              </dl>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
