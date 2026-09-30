import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { fmtFull, fmtLong, hashtagsOf, isVideoUrl, splitMedia, thumbOf } from '../lib/data.js'
import { EVENT_LABEL, aggregateStatus, destLabel, destTime } from '../lib/destinations.js'
import { ChannelTile, Cover, Icon, ProjectPill, StatusBadge } from './ui.jsx'

function fileLabel(url, i) {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m) return `Archivo ${i + 1} · Drive`
  if (url.includes('youtu')) return `Vídeo ${i + 1} · YouTube`
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || url) || url } catch { return url }
}

export default function PublicationDetail() {
  const app = useApp()
  const pub = app.publications.find((p) => p.id === app.selectedPub.id) || app.selectedPub
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
  const dests = pub.destinos || []
  const firstAcc = dests.length ? app.accountById(dests[0].accountId) : null
  const ig = firstAcc ? `https://www.instagram.com/${firstAcc.handle}/` : null
  const current = media[active] || ''
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => setConfirmDel(false), [pub.id])
  const locked = dests.some((d) => ['published', 'publishing'].includes(d.status))
  const runnable = dests.filter((d) => ['draft', 'scheduled', 'failed'].includes(d.status))
  const canRunAll = app.isAuth && runnable.length > 0 && (app.demo || runnable.some((d) => { const a = app.accountById(d.accountId); return a && app.canPublish(a) }))
  const failed = dests.filter((d) => d.status === 'failed' && d.errorMessage)
  const history = useMemo(() => {
    const out = []
    dests.forEach((d) => {
      const a = app.accountById(d.accountId)
      const evs = app.social.eventsByDest.get(d.id) || []
      if (evs.length) evs.forEach((e) => out.push({ at: e.at, type: e.type, text: EVENT_LABEL[e.type] || e.type, note: e.message, who: a?.handle }))
      else if (app.demo) {
        if (d.scheduledAt) out.push({ at: d.scheduledAt, type: 'scheduled', text: 'Programada (demo)', note: '', who: a?.handle })
        if (d.publishedAt) out.push({ at: d.publishedAt, type: 'published', text: 'Publicada (simulación demo)', note: '', who: a?.handle })
      }
    })
    return out.sort((x, y) => x.at - y.at)
  }, [dests, app.social.eventsByDest, app.accountById, app.demo])
  const stamp = (d) => `${fmtFull(d)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const promocionado = (pub.promocionado || '').toLowerCase().startsWith('s')

  return (
    <div className="view-enter">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <button className="back" onClick={() => app.setSelectedPub(null)}><Icon name="arrowLeft" size={16} /> Volver</button>
        <div className="page-actions">
          <button className="btn btn-icon" disabled={idx <= 0} onClick={() => app.setSelectedPub(list[idx - 1])} aria-label="Anterior"><Icon name="left" size={15} /></button>
          <button className="btn btn-icon" disabled={idx < 0 || idx >= list.length - 1} onClick={() => app.setSelectedPub(list[idx + 1])} aria-label="Siguiente"><Icon name="right" size={15} /></button>
        </div>
      </div>

      <div className="detail">
        <div>
          <div className="detail-hero">
            <Cover media={current} tipo={pub.tipo} iconSize={48} />
            {isVideoUrl(current) && <a href={current} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ position: 'absolute', bottom: 14, right: 14 }}><Icon name="external" size={13} /> Abrir vídeo</a>}
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

        <div className="detail-info">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ProjectPill name={pub.proyecto} />
            <StatusBadge estado={dests.length ? destLabel(aggregateStatus(dests)) : pub.estado} />
          </div>
          <h1>{pub.titulo || pub.proyecto}</h1>
          <p className="muted" style={{ margin: '0 0 var(--s5)' }}>{fmtLong(pub.fecha)}{pub.hora ? ` · ${pub.hora}` : ''}</p>

          {failed.length > 0 && (
            <div className="block"><h4>Error</h4>{failed.map((d) => <div key={d.id} className="err-box" style={{ marginBottom: 8 }}><b>@{app.accountById(d.accountId)?.handle}</b> · {d.errorMessage}</div>)}</div>
          )}

          <div className="block">
            <h4>Contenido</h4>
            {pub.copy ? <p className="copy-block">{pub.copy}</p> : <p className="muted" style={{ margin: 0 }}>Sin texto.</p>}
            {tags.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
          </div>

          {dests.length > 0 && (
            <div className="block">
              <h4>Destinos ({dests.length})</h4>
              <div className="dest-detail">
                {dests.map((d) => {
                  const a = app.accountById(d.accountId)
                  const when = d.publishedAt || d.scheduledAt
                  const canRun = app.isAuth && (app.demo || (a && app.canPublish(a))) && ['draft', 'scheduled', 'failed'].includes(d.status)
                  return (
                    <div key={d.id} className="dest-item">
                      <ChannelTile canal={d.canal} size={26} />
                      <div className="grow">
                        <b>@{a?.handle || d.accountId}</b>
                        <small>{when ? `${d.publishedAt ? 'Publicado' : 'Programado para'} ${fmtFull(when)} · ${destTime(d)}${d.timezone && !d.publishedAt ? ` (${d.timezone.replace('_', ' ')})` : ''}` : 'Sin fecha de programación'}</small>
                        {d.status === 'failed' && d.errorMessage && <small className="dest-error">{d.errorMessage}</small>}
                      </div>
                      <StatusBadge estado={destLabel(d.status)} />
                      <div className="dest-actions">
                        {d.externalUrl && <a className="btn btn-sm btn-ghost" href={d.externalUrl} target="_blank" rel="noreferrer">Ver <Icon name="external" size={12} /></a>}
                        {canRun && <button className="btn btn-sm" disabled={app.social.busy} onClick={() => app.publishDestinationNow(d)}>{d.status === 'failed' ? 'Reintentar' : 'Publicar ahora'}</button>}
                        {app.isAuth && ['draft', 'scheduled'].includes(d.status) && <button className="btn btn-sm btn-ghost" disabled={app.social.busy} onClick={() => app.cancelDestination(d)}>Cancelar</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="block">
            <h4>Información</h4>
            <dl className="kv" style={{ padding: 0 }}>
              <dt>Proyecto</dt><dd>{pub.proyecto}</dd>
              <dt>Cuenta</dt><dd>{dests.length ? dests.map((d) => `@${app.accountById(d.accountId)?.handle || d.accountId}`).join(', ') : <span className="muted">Sin cuenta asignada</span>}</dd>
              <dt>Estado</dt><dd><StatusBadge estado={dests.length ? destLabel(aggregateStatus(dests)) : pub.estado} /></dd>
              <dt>Fecha</dt><dd>{fmtFull(pub.fecha)}</dd>
              <dt>Hora</dt><dd>{pub.hora || <span className="muted">Sin hora</span>}</dd>
              <dt>Canal</dt><dd>{pub.canal ? <><ChannelTile canal={pub.canal} size={20} />{pub.canal}<span className="muted" style={{ fontWeight: 400, textTransform: 'capitalize' }}>· {pub.tipo || 'imagen'}</span></> : <span className="muted">Sin canal</span>}</dd>
              {pub.solicitante && (<><dt>Responsable</dt><dd>{pub.solicitante}</dd></>)}
              {promocionado && (<><dt>Campaña Ads</dt><dd>Sí{pub.presupuesto ? ` · ${pub.presupuesto} €` : ''}</dd></>)}
              {pub.url_post && (<><dt>Publicación</dt><dd><a href={pub.url_post} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-600)' }}>Ver publicada <Icon name="external" size={12} /></a></dd></>)}
            </dl>
          </div>

          <div className="block">
            <h4>Historial</h4>
            {history.length === 0
              ? <p className="muted" style={{ margin: 0 }}>Todavía no hay actividad registrada.</p>
              : <ol className="history">{history.map((h, i) => <li key={i}><i className={h.type} /><div><b>{h.text}{h.who ? ` · @${h.who}` : ''}</b><small>{stamp(h.at)}{h.note ? ` · ${h.note}` : ''}</small></div></li>)}</ol>}
          </div>

          {media.length > 0 && (
            <div className="block">
              <h4>Archivos ({media.length})</h4>
              <div className="link-list">{media.map((m, i) => <a key={m + i} href={m} target="_blank" rel="noreferrer"><Icon name="link" size={14} /> <span>{fileLabel(m, i)}</span></a>)}</div>
            </div>
          )}

          {locked && <p className="muted" style={{ fontSize: 12.5, margin: '0 0 var(--s3)' }}>Ya está en Instagram. Meta no permite editar ni borrar publicaciones publicadas desde la API; hazlo desde la app de Instagram.</p>}
          <div className="detail-actions">
            <button className="btn btn-primary" onClick={() => app.requireAuth(() => app.setEditing(pub))}><Icon name="edit" size={14} /> Editar</button>
            {!locked && <button className="btn" onClick={() => app.requireAuth(() => app.setEditing(pub))}><Icon name="clock" size={14} /> Programar</button>}
            {canRunAll && <button className="btn btn-accent" disabled={app.social.busy} onClick={() => app.publishPublicationNow(pub)}><Icon name="send" size={14} /> Publicar ahora</button>}
            {app.isAuth && !locked && !confirmDel && <button className="btn btn-ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>}
            {confirmDel && <span className="confirm-inline"><span>¿Eliminar esta publicación?</span><button className="btn btn-sm btn-danger" onClick={() => app.deletePublication(pub)}>Sí, eliminar</button><button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(false)}>No</button></span>}
            {ig && <a className="btn" href={ig} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> Ver perfil</a>}
          </div>
        </div>
      </div>
    </div>
  )
}
