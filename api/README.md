# Backend de CalendApp

Capa mínima en PHP (SQLite) para cuentas sociales, OAuth de Instagram, destinos de publicación y programación.
La app estática (`index.html`) sigue funcionando sin él: Google Sheets y Apps Script no cambian.

## Qué guarda

| Tabla | Contenido |
|---|---|
| `projects` | Proyectos activos (semilla en `seed/projects.json`, copia de `app/src/config/projects.json`). |
| `social_accounts` | Una fila por cuenta (`project_id`, `platform`, `external_account_id`, `username`, token **cifrado**, `token_expires_at`, `status`, `metadata`). La relación proyecto ↔ cuenta es explícita y editable. |
| `publications` | Copia del contenido a publicar (texto, archivos, tipo), identificada por `ref` (proyecto + fecha + título). |
| `publication_channels` | Destinos: una fila por publicación y cuenta (`status`, `scheduled_at`, `published_at`, `external_post_id`, `error_message`). |

| `publication_events` | Historial de cada destino (creada, programada, reprogramada, publicando, publicada, error…) que se muestra en el detalle. |

Cada destino guarda también su `timezone` (la hora se introduce en esa zona y se almacena en UTC; el cron no depende del navegador).

Estados de un destino: `draft`, `scheduled`, `publishing`, `published`, `failed`, `cancelled`.

Plataformas: `src/Platforms.php` describe los canales. Solo Instagram está implementado; Facebook, TikTok y LinkedIn figuran como «próximamente» (el backend rechaza publicar en ellos) y no se simula ninguna conexión.

Borrar: `publications/delete` elimina la publicación y sus destinos no publicados. Meta no permite borrar contenido ya publicado desde la API, así que el servidor responde 409 en ese caso.

## Puesta en marcha

1. Copia `config.example.php` a `config.local.php` (no se versiona) o usa variables de entorno con los mismos nombres.
2. Genera la clave de cifrado: `php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"` → `APP_KEY`.
3. Define `ADMIN_PASSWORD` (o `ADMIN_PASSWORD_HASH` con `password_hash`). **No reutilices la contraseña del cliente.**
4. En Meta for Developers crea una app de tipo Business con el producto **Instagram → API con inicio de sesión de Instagram**:
   - Permisos: `instagram_business_basic` e `instagram_business_content_publish`.
   - Registra como URI de redireccionamiento OAuth exactamente: `https://TU-DOMINIO/calendapp/api/instagram-callback.php` (misma que `META_REDIRECT_URI`).
   - Copia el ID y el secreto de la app de Instagram a `META_APP_ID` y `META_APP_SECRET`.
   - Las cuentas deben ser profesionales (Business o Creator). Con acceso estándar solo funcionan las cuentas con rol en la app.
5. Requisitos de PHP: 8.1+, extensiones `pdo_sqlite`, `curl`, `sodium`, `mbstring` (`gd` opcional: convierte PNG/WebP a JPEG).
6. Comprueba `api/index.php?r=status`: los cuatro indicadores de `configured` deben estar en `true`.
7. Programación (obligatorio para publicar a una hora): añade a cron
   ```
   * * * * * php /ruta/calendapp/api/cron/publish_due.php >> /ruta/calendapp/api/data/scheduler.log 2>&1
   17 3 * * * php /ruta/calendapp/api/cron/refresh_tokens.php >> /ruta/calendapp/api/data/scheduler.log 2>&1
   ```
   Sin cron, los destinos programados **no se publican** (no depende del navegador abierto, pero sí de este proceso).

## Seguridad

- Los tokens se cifran con libsodium (`APP_KEY`) y nunca se envían al navegador.
- Las acciones exigen sesión de administrador (cookie `HttpOnly`, `SameSite=Lax`), cabecera `X-CalendApp` y JSON (protección CSRF).
- `src/`, `data/`, `cron/`, `seed/` y `tests/` están bloqueados por `.htaccess` (Apache). En otros servidores, bloquéalos en su configuración.
- Instagram descarga los archivos desde `media.php` mediante URLs firmadas de 1 hora; solo se admiten orígenes `https` públicos.

## Límites de la API de Meta (documentación oficial)

- Token de 1 h → se cambia por uno de 60 días; se renueva tras 24 h y antes de caducar (`cron/refresh_tokens.php`).
- Publicación en dos pasos: contenedor (`/{ig-id}/media`) y `/{ig-id}/media_publish`. Los contenedores caducan a las 24 h.
- Solo JPEG en imágenes (8 MB); reels y stories en MP4/MOV; carruseles de hasta 10 elementos (CalendApp admite solo imágenes en carruseles).
- Texto: 2.200 caracteres, 30 hashtags y 20 menciones. La cuota diaria de publicaciones la indica la API (`content_publishing_limit`); CalendApp la consulta antes de publicar.

## Pruebas

`bash api/tests/e2e.sh` levanta el backend y un Meta simulado (`tests/mock_meta.php`) y recorre OAuth (incl. `force_reauth`), conexión, publicación de imagen/reel/carrusel, programación por cron con zona horaria, historial, borrado, errores y desconexión. Solo se ha probado contra el Meta simulado: la primera conexión real necesita una app de Meta configurada (ver «Puesta en marcha»).
