// Datos de ejemplo del modo demo. Las horas y los destinos existen solo aquí:
// la hoja real no tiene columna de hora.
import { SEED_ACCOUNTS } from './projects.js'
import { aggregateStatus, statusToEstado } from './destinations.js'

const now = new Date()
const Y = now.getFullYear()
const M = now.getMonth()
const TODAY = now.getDate()
const LAST = new Date(Y, M + 1, 0).getDate()
const day = (n) => Math.min(Math.max(1, n), LAST)
const at = (d, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Y, M, day(d), h, m) }
const U = (id) => `https://images.unsplash.com/photo-${id}?w=900&q=80`
const YT = (id) => `https://www.youtube.com/watch?v=${id}`

const ACC = { temeraria: 'clubtemeraria', ticketea: 'ticketealaoficial', prevenidos: 'prevenidosyaccion', chandrio: 'elchandriogroup', corfu: 'teatrocorfu7' }
const NAME = { temeraria: 'TEMERARIA', ticketea: 'TICKETEA', prevenidos: 'PREVENIDOS Y ACCIÓN', chandrio: 'EL CHANDRIO GROUP', corfu: 'TEATRO CORFÚ' }

// [día, proyecto, tipo, título, texto, media, destinos]
// destino: [cuenta, estado|'auto', 'HH:MM', mensaje de error?]. 'auto' = publicado si el día ya pasó, programado si no.
const SPEC = [
  [3, 'temeraria', 'imagen', 'Apertura de temporada', 'Empieza la temporada en Temeraria. Esta noche, pista abierta desde las 00:00. #temeraria #apertura', U('1516450360452-9312f5e86fc7'), [['temeraria', 'auto', '22:30']]],
  [6, 'temeraria', 'reel', 'La tribu temeraria al completo', 'Una noche, una familia, una movida. Desliza hacia arriba.', YT('9bZkp7q19f0'), [['temeraria', 'auto', '20:00']]],
  [10, 'temeraria', 'carrusel', 'Noche de gala', 'Dress code: elegante. Ambiente: exclusivo. #gala', [U('1566417713940-fe7c737a9ef2'), U('1530103862676-de8c9debad1d')].join(', '), [['temeraria', 'auto', '21:00']]],
  [13, 'temeraria', 'imagen', 'Cócteles de la semana', 'Carta nueva: tres cócteles de temporada.', U('1551538827-9c037cb4f32a'), [['temeraria', 'auto', '19:30']]],
  [17, 'temeraria', 'historia', 'Cuenta atrás: viernes', 'Este viernes, todo el mundo dentro.', U('1516450360452-9312f5e86fc7'), [['temeraria', 'auto', '18:00']]],
  [24, 'temeraria', 'reel', 'Avance del sábado', 'Lo que viene este sábado. Guarda el vídeo.', YT('3AAdKl1UYZs'), [['temeraria', 'scheduled', '21:00']]],
  [27, 'temeraria', 'imagen', 'Fiesta de cierre', 'Borrador: texto y horarios por confirmar.', U('1530103862676-de8c9debad1d'), [['temeraria', 'draft', '']]],
  [99, 'temeraria', 'imagen', 'Recap del mes', 'Repasamos el mes en una foto. Gracias por venir. #recap', U('1524368535928-5b5e00ddc76b'), [['temeraria', 'published', '19:00']]],

  [2, 'ticketea', 'imagen', 'Entradas ya a la venta', 'Ya puedes comprar tus entradas para los conciertos del mes.', U('1492684223066-81342ee5ff30'), [['ticketea', 'auto', '12:00']]],
  [7, 'ticketea', 'carrusel', 'Los conciertos del mes', 'Cuatro citas que no te puedes perder. #conciertos', [U('1470229722913-7c0e2dbbafd3'), U('1524368535928-5b5e00ddc76b'), U('1493225457124-a3eb161ffa5f')].join(', '), [['ticketea', 'auto', '13:00']]],
  [12, 'ticketea', 'reel', 'Cómo comprar tu entrada en 3 pasos', 'Elige, paga y descarga. Así de fácil.', YT('oHg5SJYRHA0'), [['ticketea', 'auto', '17:30']]],
  [16, 'ticketea', 'historia', 'Últimas entradas', 'Quedan pocas. Corre.', U('1524368535928-5b5e00ddc76b'), [['ticketea', 'auto', '11:00']]],
  [19, 'ticketea', 'imagen', 'Aviso de aforo completo', 'Concierto agotado. Gracias por la confianza.', U('1470229722913-7c0e2dbbafd3'), [['ticketea', 'failed', '10:00', 'El archivo multimedia no está disponible públicamente. Comprueba los permisos del archivo.']]],
  [23, 'ticketea', 'imagen', 'Agenda de octubre', 'Toda la programación de octubre en un vistazo.', U('1470229722913-7c0e2dbbafd3'), [['ticketea', 'scheduled', '12:00']]],
  [28, 'ticketea', 'imagen', 'Sorteo de entradas', 'Sorteamos dos entradas dobles. Participa comentando.', U('1492684223066-81342ee5ff30'), [['ticketea', 'scheduled', '11:30']]],

  [2, 'prevenidos', 'imagen', '5 consejos para una vuelta al cole sin estrés', '¿Preparados para el nuevo curso? Estos son los 5 consejos que más nos funcionan. #vueltaalcole', U('1503676260728-1c00da094a0b'), [['prevenidos', 'auto', '09:00']]],
  [6, 'prevenidos', 'reel', 'RCP en 4 pasos: guarda este vídeo', 'Comparte. Puede salvar una vida. Solo necesitas saber esto.', YT('fJ9rUzIMcZQ'), [['prevenidos', 'auto', '18:00']]],
  [11, 'prevenidos', 'imagen', 'Voluntarios del mes', 'Gracias a estas personas que hacen posible el proyecto cada semana.', U('1559027615-cd4628902d4a'), [['prevenidos', 'auto', '10:00']]],
  [18, 'prevenidos', 'carrusel', 'Botiquín básico', 'Qué no puede faltar en casa. #primerosauxilios', [U('1559027615-cd4628902d4a'), U('1503676260728-1c00da094a0b')].join(', '), [['prevenidos', 'auto', '10:00']]],
  [25, 'prevenidos', 'imagen', 'Jornada de formación', 'Apúntate a la jornada de formación en primeros auxilios.', U('1559027615-cd4628902d4a'), [['prevenidos', 'scheduled', '10:30']]],
  [29, 'prevenidos', 'historia', 'Curso de primeros auxilios', 'Borrador: fechas pendientes de confirmar.', U('1503676260728-1c00da094a0b'), [['prevenidos', 'draft', '']]],

  [4, 'chandrio', 'imagen', 'La terraza más bonita del barrio ya está abierta', 'Sol, buena compañía y las mejores tapas. Te esperamos.', U('1414235077428-338989a2e8c0'), [['chandrio', 'auto', '13:00']]],
  [8, 'chandrio', 'imagen', 'Nos expandimos: tres nuevas ciudades en 2026', 'El Chandrio Group da el salto. Este año abrimos en tres nuevas ciudades.', U('1497366216548-37526070297c'), [['chandrio', 'auto', '11:00']]],
  [9, 'chandrio', 'imagen', 'El postre del mes: tarta de queso con membrillo', 'La más pedida del mes.', U('1571877227200-a0d98ea607e9'), [['chandrio', 'auto', '16:30']]],
  [14, 'chandrio', 'carrusel', 'El equipo detrás del grupo', 'Las personas que hacen posible todo esto cada día. Desliza para conocernos.', [U('1522071820081-009f0129c71c'), U('1573496359142-b8d87734a5a2'), U('1559060017-445fb9313ede')].join(', '), [['chandrio', 'auto', '12:00']]],
  [21, 'chandrio', 'reel', 'Así elaboramos nuestro pan de masa madre', '72 horas de fermentación. No hay atajos para el sabor real.', YT('kJQP7kiw5Fk'), [['chandrio', 'scheduled', '13:00']]],
  [26, 'chandrio', 'imagen', 'Atardecer en la terraza', 'El sol bajando y una copa en la mano.', U('1507525428034-b723cf961d3e'), [['chandrio', 'scheduled', '19:30']]],
  [99, 'chandrio', 'imagen', 'Cerramos septiembre', 'Cerramos el mes con todo el equipo. Gracias por acompañarnos. #septiembre', U('1530103862676-de8c9debad1d'), [['temeraria', 'scheduled', '18:00'], ['corfu', 'published', '12:00'], ['chandrio', 'failed', '18:30', 'No se pudo descargar el archivo multimedia (tiempo de espera agotado).']]],

  [5, 'corfu', 'imagen', 'Nueva temporada', 'Arranca la temporada en el Teatro Corfú. Consulta la cartelera.', U('1507003211169-0a1dd7228f2d'), [['corfu', 'auto', '12:00']]],
  [9, 'corfu', 'reel', 'Estreno: La noche de los sueños', 'Una historia de amor, memoria y segundas oportunidades.', YT('LXb3EKWsInQ'), [['corfu', 'auto', '19:00']]],
  [12, 'corfu', 'carrusel', 'Detrás del telón', 'Lo que no ves antes del telón. Desliza.', [U('1585699324551-f6c309eedeca'), U('1507003211169-0a1dd7228f2d')].join(', '), [['corfu', 'auto', '18:00']]],
  [15, 'corfu', 'historia', 'Cuenta atrás: 3 días para el estreno', 'Ya queda poco. Os mandamos energía desde los camerinos.', U('1507003211169-0a1dd7228f2d'), [['corfu', 'auto', '18:00']]],
  [19, 'corfu', 'imagen', 'El equipo al completo antes del estreno', 'Nervios, ilusión y mucho talento.', U('1507003211169-0a1dd7228f2d'), [['corfu', 'auto', '20:00']]],
  [22, 'corfu', 'imagen', 'Abono de temporada', 'Ya puedes reservar tu abono de temporada.', U('1585699324551-f6c309eedeca'), [['corfu', 'scheduled', '12:00']]],
  [27, 'corfu', 'imagen', 'Ensayo general abierto', 'Ven a ver el ensayo general. Aforo limitado.', U('1585699324551-f6c309eedeca'), [['corfu', 'scheduled', '20:00']]],
]

function buildDests(pubId, list, dayN) {
  return list.map(([acc, status, time, err]) => {
    const d = day(dayN)
    const past = d < TODAY
    const st = status === 'auto' ? (past ? 'published' : 'scheduled') : status
    const when = time ? at(dayN, time) : null
    return {
      id: `${pubId}-${ACC[acc]}`, accountId: ACC[acc], canal: 'Instagram', status: st,
      scheduledAt: st === 'draft' ? null : when,
      publishedAt: st === 'published' ? when : null,
      externalPostId: null, errorMessage: st === 'failed' ? err || 'Error al publicar.' : null,
    }
  })
}

export const demoPublications = SPEC.map(([dayN, proj, tipo, titulo, copy, media, dests], i) => {
  const id = `demo-${i + 1}`
  const destinos = buildDests(id, dests, dayN)
  const first = destinos.find((d) => d.scheduledAt)
  return {
    id, proyecto: NAME[proj], fecha: new Date(Y, M, day(dayN)), titulo, copy, media, tipo,
    canal: 'Instagram', estado: statusToEstado(aggregateStatus(destinos)), hora: first ? `${String(first.scheduledAt.getHours()).padStart(2, '0')}:${String(first.scheduledAt.getMinutes()).padStart(2, '0')}` : '',
    url_post: '', promocionado: 'No', presupuesto: '', destinos,
  }
})

const inDays = (n) => new Date(Y, M, TODAY + n)
export const demoRequests = [
  { id: 'r0', proyecto: 'TEATRO CORFÚ', fecha: inDays(0), titulo: 'Post de la obra de este fin de semana', info: 'Anunciar la función del sábado con horario y enlace de entradas.', solicitante: 'Ana P.', estado: 'Aprobado', tipo: 'imagen', canal: 'Instagram', prioridad: 'Media', contenido: U('1507003211169-0a1dd7228f2d') },
  { id: 'r1', proyecto: 'TICKETEA', fecha: inDays(5), titulo: 'Vídeo: cómo funciona el acceso con QR', info: 'Vídeo corto explicando el acceso con QR el día del evento. Tono claro.', solicitante: 'Carlos M.', estado: 'En revisión', tipo: 'video', canal: 'Instagram', prioridad: 'Alta', contenido: '' },
  { id: 'r2', proyecto: 'TEMERARIA', fecha: inDays(10), titulo: 'Cartel de la fiesta de aniversario', info: 'Cartel para redes con fecha, cabezas de cartel y enlace de entradas.', solicitante: 'Pedro L.', estado: 'Pendiente', tipo: 'imagen', canal: 'Instagram', prioridad: 'Muy alta', contenido: '' },
  { id: 'r3', proyecto: 'PREVENIDOS Y ACCIÓN', fecha: inDays(15), titulo: 'Infografía: prevención en verano', info: 'Medidas de seguridad en la playa. Estilo visual limpio, colores claros.', solicitante: 'María G.', estado: 'Pendiente', tipo: 'imagen', canal: 'Instagram', prioridad: 'Media', contenido: '' },
].map((r) => ({ ...r, promocionado: 'No', presupuesto: '' }))

// Cuentas del modo demo: mismas conexiones que la configuración inicial, marcadas como demo.
export const demoAccounts = SEED_ACCOUNTS.map((a) => ({
  id: a.username, projectId: a.projectId, platform: a.platform, username: a.username, status: 'demo',
  tokenExpiresAt: null, metadata: {}, source: 'demo',
}))
