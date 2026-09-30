<?php
declare(strict_types=1);

// Backend de CalendApp: cuentas sociales, OAuth de Instagram, destinos de publicación y publicación manual.
// La programación automática la ejecuta cron/publish_due.php (no depende del navegador).

require __DIR__ . '/src/autoload.php';

use CalendApp\{Auth, Config, Db, Http, Instagram, Media, MetaException, Platforms, Publisher, Repo};

const VERSION = '1.0.0';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
set_exception_handler(function (Throwable $e): void {
    error_log('[calendapp] ' . $e);
    Http::error('server', 'Error interno del servidor.', 500);
});

$route = (string) ($_GET['r'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($route === 'status') {
    Http::json(['ok' => true, 'backend' => true, 'version' => VERSION, 'configured' => Config::flags(), 'authenticated' => Auth::check()]);
}

if ($route === 'bootstrap' && $method === 'GET') {
    $authed = Auth::check();
    Http::json([
        'ok' => true, 'backend' => true, 'version' => VERSION, 'configured' => Config::flags(), 'authenticated' => $authed,
        'projects' => Repo::projects(), 'platforms' => Platforms::all(), 'accounts' => Repo::accounts(),
        'destinations' => $authed ? Repo::channels() : [], 'events' => $authed ? Repo::events() : [],
    ]);
}

if ($method !== 'POST') {
    Http::error('not_found', 'Ruta no encontrada.', 404);
}
Auth::requireCsrf();
$in = Http::body();

if ($route === 'auth/login') {
    if (!Auth::login((string) ($in['password'] ?? ''))) {
        Http::error('bad_credentials', 'Contraseña incorrecta.', 401);
    }
    Http::json(['ok' => true]);
}
if ($route === 'auth/logout') {
    Auth::logout();
    Http::json(['ok' => true]);
}

Auth::require();

function need(array $in, string $key): string
{
    $v = trim((string) ($in[$key] ?? ''));
    if ($v === '') {
        Http::error('invalid', "Falta el campo «{$key}».", 422);
    }
    return $v;
}

function accountOrFail(array $in): array
{
    $acc = Repo::account((int) ($in['id'] ?? 0));
    if (!$acc) {
        Http::error('not_found', 'Cuenta no encontrada.', 404);
    }
    return $acc;
}

switch ($route) {
    case 'instagram/connect': {
        $f = Config::flags();
        if (!$f['meta_app'] || !$f['redirect_uri'] || !$f['crypto']) {
            Http::error('not_configured', 'Faltan la aplicación de Meta, la URL de retorno o APP_KEY en la configuración del servidor.', 503);
        }
        $project = isset($in['project_id']) && $in['project_id'] !== '' ? (string) $in['project_id'] : null;
        if (!Repo::projectExists($project)) {
            Http::error('invalid', 'Proyecto no válido.', 422);
        }
        $state = bin2hex(random_bytes(20));
        Repo::saveState($state, $project, Auth::sessionHash());
        Http::json(['ok' => true, 'url' => Instagram::authorizeUrl($state, !empty($in['force_reauth']))]);
    }

    case 'accounts/add': {
        $username = strtolower(ltrim(need($in, 'username'), '@'));
        if (!preg_match('/^[a-z0-9._]{1,30}$/', $username)) {
            Http::error('invalid', 'El usuario de Instagram no es válido.', 422);
        }
        $project = isset($in['project_id']) && $in['project_id'] !== '' ? (string) $in['project_id'] : null;
        if (!Repo::projectExists($project)) {
            Http::error('invalid', 'Proyecto no válido.', 422);
        }
        if (Repo::accountByUsername('instagram', $username)) {
            Http::error('exists', 'Esa cuenta ya existe.', 409);
        }
        Http::json(['ok' => true, 'id' => Repo::addAccount('instagram', $username, $project)]);
    }

    case 'accounts/update': {
        $acc = accountOrFail($in);
        $project = isset($in['project_id']) && $in['project_id'] !== '' ? (string) $in['project_id'] : null;
        if (!Repo::projectExists($project)) {
            Http::error('invalid', 'Proyecto no válido.', 422);
        }
        Repo::updateAccount((int) $acc['id'], ['project_id' => $project]);
        Http::json(['ok' => true]);
    }

    case 'accounts/disconnect': {
        $acc = accountOrFail($in);
        Repo::updateAccount((int) $acc['id'], ['access_token_enc' => null, 'token_expires_at' => null, 'status' => 'disconnected', 'last_error' => null]);
        Http::json(['ok' => true]);
    }

    case 'accounts/remove': {
        $acc = accountOrFail($in);
        if ($acc['status'] === 'connected') {
            Http::error('invalid', 'Desconecta la cuenta antes de eliminarla.', 409);
        }
        Repo::deleteAccount((int) $acc['id']);
        Http::json(['ok' => true]);
    }

    case 'accounts/refresh': {
        $acc = accountOrFail($in);
        try {
            $t = Instagram::refresh(Repo::token($acc));
            Repo::updateAccount((int) $acc['id'], [
                'access_token_enc' => \CalendApp\Crypto::encrypt($t['access_token']), 'token_expires_at' => gmdate('Y-m-d\TH:i:s\Z', time() + $t['expires_in']),
                'token_refreshed_at' => Db::now(), 'status' => 'connected', 'last_error' => null,
            ]);
        } catch (MetaException $e) {
            Http::error('meta', $e->userMessage(), 502);
        } catch (RuntimeException $e) {
            Http::error('invalid', $e->getMessage(), 409);
        }
        Http::json(['ok' => true]);
    }

    case 'accounts/check': {
        $acc = accountOrFail($in);
        try {
            $token = Repo::token($acc);
            $me = Instagram::me($token);
            $quota = Instagram::quota((string) $acc['external_account_id'], $token);
            $meta = json_decode($acc['metadata'] ?: '{}', true) ?: [];
            foreach (['account_type', 'profile_picture_url', 'followers_count', 'media_count'] as $k) {
                if (isset($me[$k])) { $meta[$k] = $me[$k]; }
            }
            Repo::updateAccount((int) $acc['id'], ['metadata' => json_encode($meta), 'last_error' => null, 'status' => 'connected']);
            Http::json(['ok' => true, 'quota' => $quota]);
        } catch (MetaException $e) {
            if ($e->isAuthError()) {
                Repo::updateAccount((int) $acc['id'], ['status' => 'expired', 'last_error' => $e->userMessage()]);
            }
            Http::error('meta', $e->userMessage(), 502);
        } catch (RuntimeException $e) {
            Http::error('invalid', $e->getMessage(), 409);
        }
    }

    case 'publications/save': {
        $ref = need($in, 'ref');
        $title = trim((string) ($in['title'] ?? ''));
        $tipo = (string) ($in['tipo'] ?? 'imagen');
        if (!in_array($tipo, ['imagen', 'video', 'reel', 'carrusel', 'historia', 'texto'], true)) {
            Http::error('invalid', 'Tipo de contenido no válido.', 422);
        }
        $project = isset($in['project_id']) && $in['project_id'] !== '' ? (string) $in['project_id'] : null;
        if (!Repo::projectExists($project)) {
            Http::error('invalid', 'Proyecto no válido.', 422);
        }
        $media = array_values(array_filter(array_map('strval', (array) ($in['media'] ?? [])), fn ($u) => preg_match('~^https?://~i', $u)));
        if (count($media) > 10) {
            Http::error('invalid', 'Un contenido admite un máximo de 10 archivos.', 422);
        }
        $dests = [];
        foreach ((array) ($in['destinations'] ?? []) as $d) {
            $acc = Repo::account((int) ($d['social_account_id'] ?? 0));
            if (!$acc || $acc['platform'] !== 'instagram') {
                Http::error('invalid', 'Cuenta de destino no válida.', 422);
            }
            $status = (string) ($d['status'] ?? 'draft');
            $when = null;
            if ($status === 'scheduled') {
                $ts = isset($d['scheduled_at']) ? strtotime((string) $d['scheduled_at']) : false;
                if ($ts === false) {
                    Http::error('invalid', 'Falta la fecha y hora de programación.', 422);
                }
                if ($ts <= time()) {
                    Http::error('invalid', 'La hora programada ya ha pasado.', 422);
                }
                if (Repo::accountPublic($acc)['status'] !== 'connected') {
                    Http::error('invalid', 'La cuenta @' . $acc['username'] . ' no está conectada: no se puede programar.', 409);
                }
                $when = gmdate('Y-m-d\TH:i:s\Z', $ts);
            }
            $tz = isset($d['timezone']) && in_array((string) $d['timezone'], \DateTimeZone::listIdentifiers(), true) ? (string) $d['timezone'] : null;
            $dests[] = ['social_account_id' => (int) $acc['id'], 'status' => $status, 'scheduled_at' => $when, 'timezone' => $tz];
        }
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        $pubId = Repo::upsertPublication($ref, isset($in['previous_ref']) ? (string) $in['previous_ref'] : null, $project, $title, (string) ($in['caption'] ?? ''), $media, $tipo);
        Repo::syncChannels($pubId, $dests);
        $pdo->commit();
        $out = array_map(fn ($c) => $c + ['ref' => $ref], Repo::channels($pubId));
        Http::json(['ok' => true, 'publication' => ['id' => $pubId, 'ref' => $ref], 'destinations' => $out]);
    }

    case 'destinations/publish': {
        @set_time_limit(180);
        $id = (int) ($in['id'] ?? 0);
        if (!Repo::channel($id)) {
            Http::error('not_found', 'Destino no encontrado.', 404);
        }
        $res = Publisher::run($id, 90);
        Http::json(['ok' => true, 'destination' => $res]);
    }

    case 'destinations/cancel': {
        $ch = Repo::channel((int) ($in['id'] ?? 0));
        if (!$ch) {
            Http::error('not_found', 'Destino no encontrado.', 404);
        }
        if (!in_array($ch['status'], ['draft', 'scheduled', 'failed'], true)) {
            Http::error('invalid', 'Este destino ya no se puede cancelar.', 409);
        }
        Repo::updateChannel((int) $ch['id'], ['status' => 'cancelled', 'error_message' => null]);
        Repo::logEvent((int) $ch['id'], 'cancelled', 'Cancelado');
        Http::json(['ok' => true]);
    }

    case 'publications/delete': {
        $ref = need($in, 'ref');
        if (!Repo::deletePublication($ref)) {
            Http::error('published', 'Esta publicación ya está publicada. Meta no permite borrarla desde la API: elimínala desde Instagram.', 409);
        }
        Http::json(['ok' => true]);
    }

    default:
        Http::error('not_found', 'Ruta no encontrada.', 404);
}
