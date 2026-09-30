// Canales de publicación. Solo Instagram está implementado; el resto queda descrito para poder añadirlo
// sin cambiar el modelo (social_accounts.platform + publication_channels).
const ALL = {
  instagram: {
    label: 'Instagram', implemented: true,
    // Requisitos y límites según la documentación oficial de Meta (API de Instagram con inicio de sesión de Instagram).
    requirements: [
      'Cuenta profesional de Instagram (Business o Creator). Las cuentas personales no se pueden conectar.',
      'Permisos solicitados: instagram_business_basic e instagram_business_content_publish.',
      'Imágenes en JPEG (máx. 8 MB). Reels en MP4/MOV (3 s–15 min, máx. 300 MB). Stories en vídeo de hasta 60 s (máx. 100 MB).',
      'Texto de hasta 2.200 caracteres, 30 hashtags y 20 menciones. Carruseles de hasta 10 imágenes.',
      'Instagram limita las publicaciones por API cada 24 h; CalendApp consulta la cuota antes de publicar.',
      'El acceso dura 60 días y se renueva automáticamente; si caduca hay que volver a conectar la cuenta.',
      'Meta no permite borrar publicaciones desde la API: eliminarlas en CalendApp no las quita de Instagram.',
    ],
  },
  facebook: { label: 'Facebook', implemented: false, requirements: [] },
  tiktok: { label: 'TikTok', implemented: false, requirements: [] },
  linkedin: { label: 'LinkedIn', implemented: false, requirements: [] },
}
export const implemented = (p) => ALL[p]?.implemented === true
export const label = (p) => ALL[p]?.label ?? p
export const all = () => Object.entries(ALL).map(([id, p]) => ({ id, ...p }))
