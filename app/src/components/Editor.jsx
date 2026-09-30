import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import {
  CHANNELS, PUB_ESTADOS, TIPOS, readAsDataUrl, scriptUploadFile, splitMedia, thumbOf, toInputDate,
} from '../lib/data.js'
import { combineDateTime, destLabel, hhmm, pubRef } from '../lib/destinations.js'
import { AccountStatusBadge } from './ui.jsx'
import { prettyProject } from '../lib/projects.js'
import { ChannelTile, Cover, Icon, Modal, ProjectAvatar, StatusBadge, tipoIcon } from './ui.jsx'

// ── Subida de archivos (misma lógica que el original) ─────────────────────
export function useUploader(scriptUrl, onUrl) {
  const [items, setItems] = useState([])
  const upload = useCallback(async (files) => {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      const patch = (status) => setItems((l) => l.map((i) => (i.key === key ? { ...i, status } : i)))
      if (file.size >= 50 * 1024 * 1024) { setItems((l) => [...l, { key, nombre: file.name, preview, status: 'toobig' }]); continue }
      setItems((l) => [...l, { key, nombre: file.name, preview, status: 'uploading' }])
      if (!scriptUrl) { patch('error'); continue }
      try {
        const res = await scriptUploadFile(scriptUrl, file.name, file.type, await readAsDataUrl(file))
        if (res?.url) { onUrl(res.url); patch('done') } else patch('error')
      } catch (e) {
        console.error('Upload error:', e?.message || e)
        patch('error')
      }
    }
  }, [scriptUrl, onUrl])
  const dismiss = (key) => setItems((l) => l.filter((i) => i.key !== key))
  return { items, upload, dismiss }
}

const STATUS_TXT = { uploading: 'Subiendo…', error: 'Error', toobig: '>50 MB' }

export function MediaField({ value, onChange, scriptUrl }) {
  const inputRef = useRef(null)
  const [url, setUrl] = useState('')
  const list = splitMedia(value)
  const valueRef = useRef(value)
  valueRef.current = value
  const append = useCallback((u) => onChange(valueRef.current ? `${valueRef.current}, ${u}` : u), [onChange])
  const { items, upload, dismiss } = useUploader(scriptUrl, append)
  const pending = items.filter((i) => i.status !== 'done')
  const remove = (i) => onChange(list.filter((_, x) => x !== i).join(', '))
  const addUrl = () => { if (url.trim()) { append(url.trim()); setUrl('') } }
  return (
    <div className="field">
      <div className="media-strip"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}>
        {list.map((m, i) => (
          <div className="media-item" key={m + i}>
            {thumbOf(m) ? <img src={thumbOf(m)} alt="" /> : <Icon name="video" size={20} />}
            <button className="rm" onClick={() => remove(i)} aria-label="Quitar"><Icon name="x" size={11} /></button>
          </div>
        ))}
        {pending.map((p) => (
          <div className="media-item" key={p.key}>
            {p.preview && <img src={p.preview} alt="" />}
            <div className="st">{STATUS_TXT[p.status]}</div>
            {p.status !== 'uploading' && <button className="rm" onClick={() => dismiss(p.key)} aria-label="Descartar"><Icon name="x" size={11} /></button>}
          </div>
        ))}
        <button type="button" className="media-add" onClick={() => inputRef.current?.click()}><Icon name="plus" size={16} />Añadir</button>
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files.length) upload(e.target.files); e.target.value = '' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input className="input" placeholder="…o pega un enlace (Drive, YouTube, imagen)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())} />
        <button type="button" className="btn" onClick={addUrl} disabled={!url.trim()}>Añadir</button>
      </div>
    </div>
  )
}

// ── Previsualización ──────────────────────────────────────────────────────
export function PostPreview({ form, accountHandle }) {
  const app = useApp()
  const canal = (form.canal || 'Instagram').toLowerCase()
  const handle = accountHandle || app.accountOf(form.proyecto)?.handle || (form.proyecto || 'tu_proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const first = splitMedia(form.media)[0]
  const n = splitMedia(form.media).length
  const copy = form.copy || ''
  const placeholder = <span className="muted" style={{ fontStyle: 'italic' }}>El contenido aparecerá aquí…</span>
  const media = (cls) => (
    <div className={`p-media ${cls}`}><Cover media={first} tipo={form.tipo} iconSize={36} />{n > 1 && <span className="mc-count" style={{ position: 'absolute', top: 10, right: 10 }}>1/{n}</span>}</div>
  )
  const head = (sub) => (
    <div className="p-head"><ProjectAvatar name={form.proyecto || '?'} size={34} /><div><b>{canal === 'instagram' || canal === 'tiktok' ? handle : form.proyecto || 'Proyecto'}</b><small>{sub}</small></div><span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}><Icon name="more" size={16} /></span></div>
  )
  if (canal === 'tiktok') {
    return (
      <div className="phone dark">
        <div className="p-media tall" style={{ background: '#1b1b1b' }}>
          <Cover media={first} tipo={form.tipo} iconSize={40} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 14px 14px', background: 'linear-gradient(transparent,rgba(0,0,0,.75))', textAlign: 'left', color: '#fff' }}>
            <b style={{ fontSize: 13 }}>@{handle}</b>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{copy.slice(0, 180) || 'El contenido aparecerá aquí…'}</div>
          </div>
        </div>
      </div>
    )
  }
  if (canal === 'facebook' || canal === 'linkedin' || canal === 'twitter' || canal === 'web' || canal === 'youtube' || canal === 'otros') {
    return (
      <div className="phone">
        {head(canal === 'linkedin' ? 'Publicación · Público' : 'Ahora · Público')}
        <div className="p-copy" style={{ paddingTop: 0 }}>{copy || placeholder}</div>
        {first && media('wide')}
        <div className="p-actions" style={{ borderTop: '1px solid var(--line)', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', justifyContent: 'space-around', padding: '10px 12px' }}>
          <span>Me gusta</span><span>Comentar</span><span>Compartir</span>
        </div>
      </div>
    )
  }
  return (
    <div className="phone">
      {head(form.tipo === 'reel' ? 'Reel' : 'Ahora')}
      {media('')}
      <div className="p-actions"><Icon name="heart" size={20} /><Icon name="message" size={20} /><Icon name="send" size={20} /><span className="sp"><Icon name="bookmark" size={20} /></span></div>
      <div className="p-copy">{copy ? <><b>{handle}</b>{copy}</> : placeholder}</div>
    </div>
  )
}

// ── Destinos: cuentas donde se publicará ──────────────────────────────────
function DestinationPicker({ app, project, selected, setSelected, existing, disabledReason }) {
  const accounts = useMemo(() => {
    const own = app.accounts.filter((a) => a.proyecto === project)
    return [...own, ...app.accounts.filter((a) => a.proyecto !== project)]
  }, [app.accounts, project])
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <div className="field">
      <span className="label">Cuentas de destino</span>
      {disabledReason && <div className="banner err" style={{ margin: 0 }}><Icon name="info" size={15} /><span className="grow">{disabledReason}</span></div>}
      <div className="dest-list">
        {accounts.map((a) => {
          const ex = existing.get(a.id)
          const locked = ex && ex.status === 'published'
          const usable = app.canPublish(a) || a.status === 'demo'
          const off = !!disabledReason || (!usable && !ex)
          return (
            <label key={a.id} className={`dest-row ${selected.has(a.id) ? 'on' : ''} ${off || locked ? 'off' : ''}`}>
              <input type="checkbox" className="check" checked={selected.has(a.id)} disabled={off || locked} onChange={() => toggle(a.id)} />
              <ChannelTile canal={a.canal} size={22} />
              <span className="grow"><b>Instagram · @{a.handle}</b><small>{a.proyecto ? prettyProject(a.proyecto) : 'Sin proyecto asociado'}</small></span>
              {ex ? <StatusBadge estado={destLabel(ex.status)} /> : <AccountStatusBadge status={a.status} />}
            </label>
          )
        })}
        <div className="dest-row off"><input type="checkbox" className="check" disabled /><ChannelTile canal="Facebook" size={22} /><span className="grow"><b>Facebook</b><small>Sin integración disponible</small></span></div>
      </div>
      {!disabledReason && accounts.every((a) => !(app.canPublish(a) || a.status === 'demo')) && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { app.setEditing(null); app.goIntegrations() }}><Icon name="plus" size={14} /> Conectar una cuenta</button>
      )}
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────
const EMPTY = { proyecto: '', fecha: '', titulo: '', copy: '', media: '', tipo: 'imagen', canal: 'Instagram', estado: 'Programado', url_post: '', promocionado: false, presupuesto: '' }

export default function Editor() {
  const app = useApp()
  const pub = app.editing === 'new' ? null : app.editing
  const isNew = !pub
  const existing = useMemo(() => new Map((pub?.destinos || []).map((d) => [d.accountId, d])), [pub])
  const [form, setForm] = useState(() => isNew
    ? { ...EMPTY, proyecto: app.projectsFilter.length === 1 ? app.projectsFilter[0] : (app.account?.proyecto || ''), fecha: toInputDate(app.newPubDate || new Date()) }
    : {
      proyecto: pub.proyecto || '', fecha: toInputDate(pub.fecha), titulo: pub.titulo || '', copy: pub.copy || '', media: pub.media || '',
      tipo: pub.tipo || 'imagen', canal: pub.canal || '', estado: pub.estado || '', url_post: pub.url_post || '',
      promocionado: (pub.promocionado || 'No').toLowerCase().startsWith('s'), presupuesto: pub.presupuesto || '',
    })
  const [selected, setSelected] = useState(() => new Set((pub?.destinos || []).filter((d) => d.status !== 'cancelled').map((d) => d.accountId)))
  const [touched, setTouched] = useState(false)
  const [hora, setHora] = useState(() => {
    const d = (pub?.destinos || []).find((x) => x.scheduledAt)
    return d ? hhmm(d.scheduledAt) : ''
  })
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const previousRef = useMemo(() => (pub ? pubRef(pub) : null), [pub])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMedia = useCallback((v) => setForm((f) => ({ ...f, media: v })), [])
  const close = () => { app.setEditing(null); app.setNewPubDate(null) }
  const valid = form.proyecto && form.fecha && form.titulo.trim()
  const canalList = [...new Set([...CHANNELS.filter((x) => x !== 'Otros'), ...(form.canal && !CHANNELS.includes(form.canal) ? [form.canal] : [])])]

  // Sin selección manual, los destinos por defecto son las cuentas del proyecto elegido.
  useEffect(() => {
    if (touched || (pub?.destinos?.length)) return
    setSelected(new Set(app.accounts.filter((a) => a.proyecto === form.proyecto && (app.canPublish(a) || a.status === 'demo')).map((a) => a.id)))
  }, [form.proyecto, touched, pub, app.accounts, app.canPublish])

  const backend = app.social.backend
  const disabledReason = form.canal !== 'Instagram' ? 'Este canal solo se registra en el calendario.'
    : app.demo ? null
      : backend.state !== 'online' ? 'El servidor de CalendApp no está disponible: los destinos no se pueden guardar.'
        : !backend.authenticated ? 'Inicia sesión en el servidor (Ajustes → Integraciones) para elegir cuentas y programar.'
          : null
  const pickedAccounts = [...selected].map((id) => app.accountById(id)).filter(Boolean)
  const usesDestinations = !disabledReason && pickedAccounts.length > 0
  const firstHandle = pickedAccounts[0]?.handle

  const validateDestinations = (scheduling, now) => {
    if (!usesDestinations) return ''
    if (form.tipo === 'texto' || splitMedia(form.media).length === 0) return 'Instagram necesita una imagen o un vídeo para publicar.'
    if (scheduling) {
      if (!hora) return 'Indica la hora para programar la publicación.'
      const when = combineDateTime(new Date(`${form.fecha}T12:00:00`), hora)
      if (!when) return 'La hora no es válida.'
      if (!now && !app.demo && when <= new Date()) return 'La hora programada ya ha pasado. Cámbiala o usa “Publicar ahora”.'
    }
    return ''
  }

  const buildDests = (estado, scheduling) => {
    if (!usesDestinations) return undefined
    const when = scheduling ? combineDateTime(new Date(`${form.fecha}T12:00:00`), hora) : null
    return [...selected].map((accountId) => {
      const ex = existing.get(accountId)
      if (ex && ex.status === 'published') return { accountId, status: 'published', scheduledAt: ex.scheduledAt }
      return { accountId, status: scheduling ? 'scheduled' : 'draft', scheduledAt: when }
    }).filter((d) => d.status !== 'published')
  }

  const save = async (estadoOverride, { now = false } = {}) => {
    if (!valid || saving) return
    const estado = estadoOverride ?? form.estado
    const scheduling = !now && estado === 'Programado'
    const err = validateDestinations(scheduling, now)
    if (err) { setProblem(err); return }
    setProblem('')
    setSaving(true)
    const dests = buildDests(estado, scheduling)
    const publishAfter = now ? [...selected].filter((id) => existing.get(id)?.status !== 'published') : undefined
    try {
      if (isNew) await app.createPublication({ ...form, estado, hora, promocionado: undefined, url_post: undefined }, { dests, publishAfter })
      else {
        await app.savePublication({ ...pub, ...form, estado, fecha: form.fecha ? new Date(`${form.fecha}T12:00:00`) : pub.fecha, promocionado: form.promocionado ? 'Sí' : 'No' }, { dests, previousRef, publishAfter })
      }
    } finally { setSaving(false) }
  }

  const canPublishNow = usesDestinations && !app.demo && pickedAccounts.some((a) => app.canPublish(a) && existing.get(a.id)?.status !== 'published')
  const busyLabel = saving ? 'Guardando…' : null

  return (
    <Modal onClose={close}>
      <div className="dialog-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="icon-btn" onClick={close} aria-label="Cerrar"><Icon name="x" size={16} /></button>
          <div><h2>{isNew ? 'Nueva publicación' : 'Editar publicación'}</h2><small>{isNew ? 'Se añadirá a la hoja de publicaciones' : 'Los cambios se guardan en la hoja'}</small></div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={close}>Cancelar</button>
          {canPublishNow && <button className="btn btn-accent" disabled={!valid || saving} onClick={() => save(undefined, { now: true })}><Icon name="send" size={14} /> Publicar ahora</button>}
          {isNew ? (
            <>
              <button className="btn" disabled={!valid || saving} onClick={() => save('Borrador')}>{busyLabel || 'Guardar borrador'}</button>
              <button className="btn btn-primary" disabled={!valid || saving} onClick={() => save('Programado')}>{busyLabel || 'Programar publicación'}</button>
            </>
          ) : <button className="btn btn-primary" disabled={!valid || saving} onClick={() => save()}>{busyLabel || 'Guardar cambios'}</button>}
        </div>
      </div>

      <div className="dialog-body">
        {problem && <div className="banner err"><Icon name="info" size={15} /><span className="grow">{problem}</span></div>}
        <div className="editor-grid">
          <div className="form-card">
            <div className="form-section">
              <div className="field-row">
                <div className="field">
                  <label htmlFor="e-proyecto">Proyecto *</label>
                  <select id="e-proyecto" className="select" value={form.proyecto} onChange={(e) => set('proyecto', e.target.value)}>
                    <option value="">Selecciona…</option>
                    {[...new Set([...app.projectNames, form.proyecto].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="e-canal">Canal</label>
                  <select id="e-canal" className="select" value={form.canal} onChange={(e) => set('canal', e.target.value)}>
                    <option value="">Sin canal</option>
                    {canalList.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <DestinationPicker app={app} project={form.proyecto} selected={selected} existing={existing} disabledReason={disabledReason}
                setSelected={(fn) => { setTouched(true); setSelected(fn) }} />
            </div>

            <div className="form-section">
              <div className="field"><label htmlFor="e-titulo">Título *</label><input id="e-titulo" className="input" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Nombre interno de la publicación" /></div>
              <div className="field">
                <label htmlFor="e-copy">Contenido</label>
                <div className="copy-wrap">
                  <textarea id="e-copy" value={form.copy} onChange={(e) => set('copy', e.target.value)} placeholder="Escribe el texto de la publicación…" />
                  <div className="copy-foot"><span>Puedes usar #hashtags y emojis</span><span>{form.copy.length} caracteres</span></div>
                </div>
              </div>
              <div className="field">
                <span className="label">Tipo de contenido</span>
                <div className="chip-group">{TIPOS.map((t) => <button type="button" key={t} className={`chip ${form.tipo === t ? 'on' : ''}`} aria-pressed={form.tipo === t} onClick={() => set('tipo', t)} style={{ textTransform: 'capitalize' }}><Icon name={tipoIcon[t]} size={13} />{t}</button>)}</div>
              </div>
            </div>

            <div className="form-section">
              <span className="label">Archivo multimedia</span>
              <MediaField value={form.media} onChange={setMedia} scriptUrl={app.config.requestsScriptUrl} />
            </div>

            <div className="form-section">
              <div className="field-row">
                <div className="field"><label htmlFor="e-fecha">Fecha *</label><input id="e-fecha" type="date" className="input" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
                <div className="field"><label htmlFor="e-hora">Hora de publicación</label><input id="e-hora" type="time" className="input" value={hora} disabled={!usesDestinations} onChange={(e) => setHora(e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label htmlFor="e-estado">Estado</label>
                  <select id="e-estado" className="select" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                    <option value="">Sin estado</option>{PUB_ESTADOS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                {!isNew && <div className="field"><label htmlFor="e-url">URL de la publicación</label><input id="e-url" className="input" value={form.url_post} onChange={(e) => set('url_post', e.target.value)} placeholder="https://…" /></div>}
              </div>
              {usesDestinations && <p className="muted" style={{ margin: 0, fontSize: 12 }}>La hora se guarda en el servidor para programar cada destino ({Intl.DateTimeFormat().resolvedOptions().timeZone}). La hoja no guarda horas.</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className={`switch ${form.promocionado ? 'on' : ''}`} onClick={() => set('promocionado', !form.promocionado)} role="switch" aria-checked={form.promocionado} aria-label="Campaña de Ads" />
                <div style={{ flex: 1 }}><b>Campaña de Ads</b><div className="muted" style={{ fontSize: 12 }}>La publicación se promociona con presupuesto</div></div>
                {form.promocionado && <input className="input" style={{ width: 120 }} placeholder="Presupuesto €" inputMode="decimal" value={form.presupuesto} onChange={(e) => set('presupuesto', e.target.value)} />}
              </div>
            </div>
          </div>

          <div className="preview-stage">
            <div className="preview-head">
              <b>Vista previa</b>
              <span className="who">{form.canal && <ChannelTile canal={form.canal} size={18} />}{form.canal || 'Sin canal'}{firstHandle && ` · @${firstHandle}${pickedAccounts.length > 1 ? ` +${pickedAccounts.length - 1}` : ''}`}</span>
            </div>
            <PostPreview form={form} accountHandle={firstHandle} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
