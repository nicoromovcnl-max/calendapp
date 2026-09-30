import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import {
  CHANNELS, INSTAGRAM_HANDLES, PUB_ESTADOS, TIPOS, projectColor, readAsDataUrl, scriptUploadFile, splitMedia, thumbOf, toInputDate,
} from '../lib/data.js'
import { ChannelTile, Cover, Icon, Modal, ProjectAvatar, tipoIcon } from './ui.jsx'

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
export function PostPreview({ form }) {
  const canal = (form.canal || 'Instagram').toLowerCase()
  const handle = INSTAGRAM_HANDLES[form.proyecto] || (form.proyecto || 'tu_proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const first = splitMedia(form.media)[0]
  const n = splitMedia(form.media).length
  const copy = form.copy || ''
  const placeholder = <span className="muted" style={{ fontStyle: 'italic' }}>El contenido aparecerá aquí…</span>
  const media = (cls) => (
    <div className={`p-media ${cls}`}><Cover media={first} tipo={form.tipo} iconSize={36} />{n > 1 && <span className="feed-count">1/{n}</span>}</div>
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

// ── Editor ────────────────────────────────────────────────────────────────
const EMPTY = { proyecto: '', fecha: '', titulo: '', copy: '', media: '', tipo: 'imagen', canal: 'Instagram', estado: 'Programado', url_post: '', promocionado: false, presupuesto: '' }

export default function Editor() {
  const app = useApp()
  const pub = app.editing === 'new' ? null : app.editing
  const isNew = !pub
  const [form, setForm] = useState(() => isNew
    ? { ...EMPTY, proyecto: app.projectsFilter.length === 1 ? app.projectsFilter[0] : '', fecha: toInputDate(new Date()) }
    : {
      proyecto: pub.proyecto || '', fecha: toInputDate(pub.fecha), titulo: pub.titulo || '', copy: pub.copy || '', media: pub.media || '',
      tipo: pub.tipo || 'imagen', canal: pub.canal || '', estado: pub.estado || '', url_post: pub.url_post || '',
      promocionado: (pub.promocionado || 'No').toLowerCase().startsWith('s'), presupuesto: pub.presupuesto || '',
    })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMedia = useCallback((v) => setForm((f) => ({ ...f, media: v })), [])
  const close = () => app.setEditing(null)
  const valid = form.proyecto && form.fecha && form.titulo.trim()
  const c = projectColor(form.proyecto)
  const canalList = [...new Set([...CHANNELS.filter((x) => x !== 'Otros'), ...(form.canal && !CHANNELS.includes(form.canal) ? [form.canal] : [])])]

  const save = async (estado) => {
    if (!valid || saving) return
    setSaving(true)
    const next = estado ?? form.estado
    if (isNew) await app.createPublication({ ...form, estado: next, promocionado: undefined, url_post: undefined })
    else app.savePublication({ ...pub, ...form, estado: next, fecha: form.fecha ? new Date(`${form.fecha}T12:00:00`) : pub.fecha, promocionado: form.promocionado ? 'Sí' : 'No' })
    setSaving(false)
  }

  return (
    <Modal onClose={close}>
      <div className="dialog-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label="Cerrar"><Icon name="x" size={16} /></button>
          <div><h2>{isNew ? 'Nueva publicación' : 'Editar publicación'}</h2><small>{isNew ? 'Se añadirá a la hoja PUBLICACIONES' : 'Los cambios se guardan en la hoja'}</small></div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={close}>Cancelar</button>
          {isNew ? (
            <>
              <button className="btn" disabled={!valid || saving} onClick={() => save('Borrador')}>Guardar borrador</button>
              <button className="btn btn-primary" disabled={!valid || saving} onClick={() => save('Programado')}>Programar publicación</button>
            </>
          ) : <button className="btn btn-primary" disabled={!valid || saving} onClick={() => save()}>Guardar cambios</button>}
        </div>
      </div>

      <div className="dialog-body">
        <div className="editor-grid">
          <div className="editor-col">
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="field">
                <span className="label">Canal</span>
                <div className="channel-tabs">
                  {canalList.map((ch) => (
                    <button type="button" key={ch} className={`channel-tab ${form.canal === ch ? 'on' : ''}`} onClick={() => set('canal', form.canal === ch ? '' : ch)}>
                      <ChannelTile canal={ch} size={20} />{ch}
                    </button>
                  ))}
                </div>
              </div>

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
                <div className="chip-group">{TIPOS.map((t) => <button type="button" key={t} className={`chip ${form.tipo === t ? 'on' : ''}`} onClick={() => set('tipo', t)} style={{ textTransform: 'capitalize' }}><Icon name={tipoIcon[t]} size={13} />{t}</button>)}</div>
              </div>
            </div>

            <div className="card card-pad">
              <div className="label" style={{ marginBottom: 10 }}>Archivo multimedia</div>
              <MediaField value={form.media} onChange={setMedia} scriptUrl={app.config.requestsScriptUrl} />
            </div>

            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <label htmlFor="e-proyecto">Proyecto *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: form.proyecto ? c.dot : 'var(--line-strong)', flex: '0 0 auto' }} />
                  <select id="e-proyecto" className="select" value={form.proyecto} onChange={(e) => set('proyecto', e.target.value)}>
                    <option value="">Selecciona…</option>
                    {[...new Set([...app.projectNames, form.proyecto].filter(Boolean))].sort().map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field"><label htmlFor="e-fecha">Fecha *</label><input id="e-fecha" type="date" className="input" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
                <div className="field"><label htmlFor="e-estado">Estado / programación</label>
                  <select id="e-estado" className="select" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                    <option value="">Sin estado</option>
                    {PUB_ESTADOS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {!isNew && <div className="field"><label htmlFor="e-url">URL de la publicación</label><input id="e-url" className="input" value={form.url_post} onChange={(e) => set('url_post', e.target.value)} placeholder="https://…" /></div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
                <button type="button" className={`switch ${form.promocionado ? 'on' : ''}`} onClick={() => set('promocionado', !form.promocionado)} role="switch" aria-checked={form.promocionado} aria-label="Campaña de Ads" />
                <div style={{ flex: 1 }}><b>Campaña de Ads</b><div className="muted" style={{ fontSize: 12 }}>La publicación se promociona con presupuesto</div></div>
                {form.promocionado && <input className="input" style={{ width: 120 }} placeholder="Presupuesto €" inputMode="decimal" value={form.presupuesto} onChange={(e) => set('presupuesto', e.target.value)} />}
              </div>
            </div>
          </div>

          <div className="preview-card">
            <div className="preview-label">Vista previa</div>
            <PostPreview form={form} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
