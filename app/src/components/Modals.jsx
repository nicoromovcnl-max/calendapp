import { useState } from 'react'
import { lsGet, lsRemove, lsSet } from '../lib/storage.js'
import { useApp } from '../store.jsx'
import { CHANNELS, PRIORIDADES, REQ_ESTADOS, TIPOS, scriptUpdateRequest, toInputDate } from '../lib/data.js'
import { ChannelTile, Icon, Modal, tipoIcon } from './ui.jsx'
import { MediaField } from './Editor.jsx'

const NAME_KEY = 'pubcal_solicitante'
const storedName = () => { try { return lsGet(NAME_KEY) || '' } catch { return '' } }
const PRIO_COLOR = { Baja: '#6b7280', Media: '#3b82f6', Alta: '#f59e0b', 'Muy alta': '#dc2626' }

function Head({ title, sub, onClose }) {
  return (
    <div className="dialog-head">
      <div><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
    </div>
  )
}

function ChoiceChips({ options, value, onChange, icons, colors, allowClear }) {
  return (
    <div className="chip-group">
      {options.map((o) => (
        <button type="button" key={o} className={`chip ${value === o ? 'on' : ''}`} onClick={() => onChange(allowClear && value === o ? '' : o)}
          style={value === o && colors ? { background: colors[o], borderColor: colors[o], color: '#fff' } : { textTransform: icons ? 'capitalize' : undefined }}>
          {icons && icons[o] && <Icon name={icons[o]} size={13} />}{icons === undefined && CHANNELS.includes(o) && <ChannelTile canal={o} size={16} />}{o}
        </button>
      ))}
    </div>
  )
}

// ── Acceso del equipo ─────────────────────────────────────────────────────
export function AuthModal() {
  const app = useApp()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (app.login(pw)) app.setShowAuth(false)
    else { setErr('Contraseña incorrecta'); setPw('') }
  }
  return (
    <Modal onClose={() => app.setShowAuth(false)} size="narrow">
      <Head title="Acceso del equipo" sub="Contraseña para añadir y editar publicaciones" onClose={() => app.setShowAuth(false)} />
      <form className="dialog-body" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="pw">Contraseña</label>
          <input id="pw" type="password" className="input" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} placeholder="Contraseña" style={err ? { borderColor: 'var(--red)' } : undefined} />
          {err && <span style={{ color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>{err}</span>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={!pw}>Entrar</button>
      </form>
    </Modal>
  )
}

// ── Nueva petición ────────────────────────────────────────────────────────
const NEW_REQ = { proyecto: '', proyectoOtros: '', fecha: '', titulo: '', info: '', contenido: '', solicitante: '', tipo: 'imagen', canal: '', prioridad: 'Media', promocionado: false, presupuesto: '' }

export function RequestForm() {
  const app = useApp()
  const [form, setForm] = useState({ ...NEW_REQ, solicitante: storedName() })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const proyecto = form.proyecto === '__otros__' ? form.proyectoOtros.trim() : form.proyecto
  const valid = proyecto && form.fecha && form.titulo.trim() && form.solicitante.trim()
  const close = () => app.setRequestForm(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    await app.submitRequest({ ...form, proyecto })
    setBusy(false)
    close()
  }
  return (
    <Modal onClose={close} size="medium">
      <Head title="Nueva petición" sub="El equipo de marketing la revisará pronto" onClose={close} />
      <form onSubmit={submit}>
        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field-row">
            <div className="field"><label htmlFor="r-proy">Proyecto *</label>
              <select id="r-proy" className="select" value={form.proyecto} onChange={(e) => set('proyecto', e.target.value)}>
                <option value="">Selecciona…</option>{app.projectNames.map((p) => <option key={p}>{p}</option>)}<option value="__otros__">Otros…</option>
              </select>
            </div>
            <div className="field"><label htmlFor="r-fecha">Fecha deseada *</label><input id="r-fecha" type="date" className="input" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
          </div>
          {form.proyecto === '__otros__' && <div className="field"><label>Nombre del proyecto *</label><input className="input" value={form.proyectoOtros} onChange={(e) => set('proyectoOtros', e.target.value)} /></div>}
          <div className="field"><label htmlFor="r-titulo">Título del post *</label><input id="r-titulo" className="input" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="¿Qué necesitas publicar?" /></div>
          <div className="field"><label htmlFor="r-info">Información adicional</label><textarea id="r-info" className="textarea" value={form.info} onChange={(e) => set('info', e.target.value)} placeholder="Tono, referencias, textos, horarios…" /></div>
          <div className="field"><span className="label">Tipo de contenido</span><ChoiceChips options={TIPOS} value={form.tipo} onChange={(v) => set('tipo', v)} icons={tipoIcon} /></div>
          <div className="field"><span className="label">Canal</span><ChoiceChips options={CHANNELS} value={form.canal} onChange={(v) => set('canal', v)} allowClear /></div>
          <div className="field"><span className="label">Prioridad</span><ChoiceChips options={PRIORIDADES} value={form.prioridad} onChange={(v) => set('prioridad', v)} colors={PRIO_COLOR} icons={{}} /></div>
          <div className="field"><span className="label">Archivos (imagen o vídeo)</span><MediaField value={form.contenido} onChange={(v) => set('contenido', v)} scriptUrl={app.config.requestsScriptUrl} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className={`switch ${form.promocionado ? 'on' : ''}`} onClick={() => set('promocionado', !form.promocionado)} role="switch" aria-checked={form.promocionado} aria-label="Campaña de Ads" />
            <b style={{ flex: 1 }}>Campaña de Ads</b>
            {form.promocionado && <input className="input" style={{ width: 130 }} placeholder="Presupuesto €" value={form.presupuesto} onChange={(e) => set('presupuesto', e.target.value)} />}
          </div>
          <div className="field"><label htmlFor="r-sol">Tu nombre *</label><input id="r-sol" className="input" value={form.solicitante} onChange={(e) => set('solicitante', e.target.value)} placeholder="¿Quién solicita?" /></div>
        </div>
        <div className="dialog-foot"><button type="button" className="btn" onClick={close}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={!valid || busy}>{busy ? 'Enviando…' : 'Enviar petición'}</button></div>
      </form>
    </Modal>
  )
}

// ── Editar petición ───────────────────────────────────────────────────────
export function RequestEdit() {
  const app = useApp()
  const req = app.requestEdit
  const [form, setForm] = useState({
    proyecto: req.proyecto || '', titulo: req.titulo || '', info: req.info || '', estado: req.estado || 'Pendiente',
    fecha: toInputDate(req.fecha), canal: req.canal || '', tipo: (req.tipo || 'imagen').toLowerCase().trim(), contenido: req.contenido || '',
    prioridad: req.prioridad || 'Media', promocionado: (req.promocionado || 'No').toLowerCase().startsWith('s'), presupuesto: req.presupuesto || '',
  })
  const [actor, setActor] = useState(storedName())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => app.setRequestEdit(null)

  const save = async () => {
    setBusy(true); setErr('')
    const who = app.isAuth ? null : actor.trim() || storedName()
    if (who) { try { lsSet(NAME_KEY, who) } catch { /* */ } }
    const payload = who ? { ...form, modificado_por: who } : { ...form }
    const next = { ...req, ...form, fecha: new Date(form.fecha), promocionado: form.promocionado ? 'Sí' : 'No' }
    const patchLocal = () => {
      try {
        const list = JSON.parse(lsGet('pubcal_requests') || '[]')
        const i = list.findIndex((r) => r.id === req.id)
        if (i >= 0) { list[i] = { ...list[i], ...payload }; lsSet('pubcal_requests', JSON.stringify(list)) }
      } catch { /* */ }
    }
    try {
      if (app.config.requestsScriptUrl && req.id.startsWith('sheet-')) await scriptUpdateRequest(app.config.requestsScriptUrl, parseInt(req.id.replace('sheet-', '')), payload)
      patchLocal()
    } catch {
      setErr('No se pudo guardar en la hoja. Los cambios se aplicaron localmente.')
      patchLocal()
    }
    app.saveRequest(next, req.estado)
    setBusy(false)
  }

  return (
    <Modal onClose={close} size="medium">
      <Head title="Editar petición" sub={req.proyecto} onClose={close} />
      <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field-row">
          <div className="field"><label>Proyecto</label><select className="select" value={form.proyecto} onChange={(e) => set('proyecto', e.target.value)}>{[...new Set([...app.projectNames, form.proyecto])].sort().map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="field"><label>Estado</label><select className="select" value={form.estado} onChange={(e) => set('estado', e.target.value)}>{REQ_ESTADOS.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="field"><label>Título</label><input className="input" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} /></div>
        <div className="field"><label>Información adicional</label><textarea className="textarea" value={form.info} onChange={(e) => set('info', e.target.value)} /></div>
        <div className="field-row">
          <div className="field"><label>Fecha</label><input type="date" className="input" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
          <div className="field"><label>Canal</label><select className="select" value={form.canal} onChange={(e) => set('canal', e.target.value)}><option value="">Sin canal</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="field"><span className="label">Tipo de contenido</span><ChoiceChips options={TIPOS} value={form.tipo} onChange={(v) => set('tipo', v)} icons={tipoIcon} /></div>
        <div className="field"><span className="label">Prioridad</span><ChoiceChips options={PRIORIDADES} value={form.prioridad} onChange={(v) => set('prioridad', v)} colors={PRIO_COLOR} icons={{}} /></div>
        <div className="field"><span className="label">Archivos</span><MediaField value={form.contenido} onChange={(v) => set('contenido', v)} scriptUrl={app.config.requestsScriptUrl} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className={`switch ${form.promocionado ? 'on' : ''}`} onClick={() => set('promocionado', !form.promocionado)} role="switch" aria-checked={form.promocionado} aria-label="Campaña de Ads" />
          <b style={{ flex: 1 }}>Campaña de Ads</b>
          {form.promocionado && <input className="input" style={{ width: 130 }} placeholder="Presupuesto €" value={form.presupuesto} onChange={(e) => set('presupuesto', e.target.value)} />}
        </div>
        {!app.isAuth && <div className="field"><label>Tu nombre</label><input className="input" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Quién modifica la petición" /></div>}
        {err && <div className="banner err" style={{ margin: 0 }}><Icon name="info" size={15} /><span className="grow">{err}</span></div>}
      </div>
      <div className="dialog-foot"><button className="btn" onClick={close}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={busy || !form.fecha || !form.titulo.trim()}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </Modal>
  )
}

// ── Eliminar petición ─────────────────────────────────────────────────────
export function RequestDelete() {
  const app = useApp()
  const req = app.requestDelete
  const [name, setName] = useState(storedName())
  const close = () => app.setRequestDelete(null)
  const ok = app.isAuth || name.trim()
  return (
    <Modal onClose={close} size="narrow">
      <Head title="Eliminar petición" onClose={close} />
      <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0 }}>¿Eliminar <b>«{req.titulo}»</b>? Esta acción no se puede deshacer.</p>
        {!app.isAuth && <div className="field"><label>Tu nombre</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Quién elimina la petición" /></div>}
      </div>
      <div className="dialog-foot">
        <button className="btn" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} disabled={!ok}
          onClick={() => { const who = app.isAuth ? null : name.trim(); if (who) { try { lsSet(NAME_KEY, who) } catch { /* */ } } app.deleteRequest(req, who) }}>Eliminar</button>
      </div>
    </Modal>
  )
}
