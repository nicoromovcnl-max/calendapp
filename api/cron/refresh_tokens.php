<?php
declare(strict_types=1);

// Renueva los tokens de larga duración antes de que caduquen (60 días). Ejecutar una vez al día:
//   17 3 * * * php /ruta/a/calendapp/api/cron/refresh_tokens.php >> /ruta/a/calendapp/api/data/scheduler.log 2>&1
// Meta solo permite renovar tokens con más de 24 h que sigan vigentes.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/src/autoload.php';

use CalendApp\{Crypto, Db, Instagram, MetaException, Repo};

Db::pdo();
foreach (Repo::accounts() as $pub) {
    if ($pub['status'] !== 'connected' || !$pub['token_expires_at']) {
        continue;
    }
    if (strtotime($pub['token_expires_at']) - time() > 10 * 86400) {
        continue; // aún queda margen
    }
    $acc = Repo::account($pub['id']);
    try {
        $t = Instagram::refresh(Repo::token($acc));
        Repo::updateAccount($pub['id'], ['access_token_enc' => Crypto::encrypt($t['access_token']), 'token_expires_at' => gmdate('Y-m-d\TH:i:s\Z', time() + $t['expires_in']), 'token_refreshed_at' => Db::now(), 'last_error' => null]);
        fwrite(STDOUT, "[" . gmdate('c') . "] @{$pub['username']}: token renovado\n");
    } catch (MetaException $e) {
        Repo::updateAccount($pub['id'], ['status' => $e->isAuthError() ? 'expired' : 'error', 'last_error' => $e->userMessage()]);
        fwrite(STDOUT, "[" . gmdate('c') . "] @{$pub['username']}: {$e->userMessage()}\n");
    } catch (Throwable $e) {
        fwrite(STDOUT, "[" . gmdate('c') . "] @{$pub['username']}: {$e->getMessage()}\n");
    }
}
