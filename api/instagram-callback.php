<?php
declare(strict_types=1);

// Retorno del inicio de sesión de Instagram (URI registrada en la app de Meta).
require __DIR__ . '/src/autoload.php';

use CalendApp\{Auth, Config, Crypto, Db, Instagram, MetaException, Repo};

function back(string $status, string $msg): never
{
    header('Location: ' . Config::appUrl() . '#/settings?ig=' . $status . '&msg=' . rawurlencode($msg));
    exit;
}

try {
    if (isset($_GET['error'])) {
        back('error', $_GET['error'] === 'access_denied' ? 'Autorización cancelada en Instagram.' : (string) ($_GET['error_description'] ?? 'Instagram devolvió un error.'));
    }
    $code = (string) ($_GET['code'] ?? '');
    $state = (string) ($_GET['state'] ?? '');
    if ($code === '' || $state === '') {
        back('error', 'Respuesta de Instagram incompleta.');
    }
    if (!Auth::check()) {
        back('error', 'La sesión del servidor caducó. Inicia sesión y vuelve a conectar.');
    }
    $st = Repo::consumeState($state);
    if (!$st || !hash_equals((string) $st['session_hash'], Auth::sessionHash())) {
        back('error', 'La solicitud de conexión no es válida o caducó. Inténtalo de nuevo.');
    }

    $short = Instagram::exchangeCode($code);
    $long = Instagram::longLived($short['access_token']);
    $me = Instagram::me($long['access_token']);
    $igId = (string) ($me['user_id'] ?? $short['user_id']);
    $username = strtolower((string) ($me['username'] ?? ''));
    if ($igId === '' || $username === '') {
        back('error', 'No se pudo obtener la cuenta de Instagram.');
    }
    $type = strtoupper((string) ($me['account_type'] ?? ''));
    if ($type !== '' && !in_array($type, ['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'], true)) {
        back('error', '@' . $username . ' no es una cuenta profesional (Business o Creator).');
    }

    $meta = array_filter(['account_type' => $me['account_type'] ?? null, 'profile_picture_url' => $me['profile_picture_url'] ?? null, 'followers_count' => $me['followers_count'] ?? null, 'media_count' => $me['media_count'] ?? null, 'permissions' => $short['permissions']], fn ($v) => $v !== null);
    $fields = [
        'external_account_id' => $igId, 'username' => $username, 'access_token_enc' => Crypto::encrypt($long['access_token']),
        'token_expires_at' => gmdate('Y-m-d\TH:i:s\Z', time() + $long['expires_in']), 'token_refreshed_at' => Db::now(), 'status' => 'connected',
        'metadata' => json_encode($meta), 'last_error' => null, 'connected_at' => Db::now(),
    ];
    $acc = Repo::accountByExternal('instagram', $igId) ?: Repo::accountByUsername('instagram', $username);
    if ($acc) {
        if ($st['project_id'] && !$acc['project_id']) { $fields['project_id'] = $st['project_id']; }
        Repo::updateAccount((int) $acc['id'], $fields);
    } else {
        $id = Repo::addAccount('instagram', $username, $st['project_id'] ?: null);
        Repo::updateAccount($id, $fields);
    }
    back('connected', 'Cuenta @' . $username . ' conectada');
} catch (MetaException $e) {
    back('error', $e->userMessage());
} catch (Throwable $e) {
    error_log('[calendapp] ' . $e);
    back('error', 'Error interno al conectar la cuenta.');
}
