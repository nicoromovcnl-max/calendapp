<?php
declare(strict_types=1);

// Scheduler real: publica los destinos programados cuya hora ya llegó y retoma los que siguen procesándose.
// No depende del navegador. Ejecutar cada minuto desde cron:
//   * * * * * php /ruta/a/calendapp/api/cron/publish_due.php >> /ruta/a/calendapp/api/data/scheduler.log 2>&1
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/src/autoload.php';

use CalendApp\{Db, Publisher, Repo};

$lock = fopen(dirname(__DIR__) . '/data/scheduler.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0); // ya hay una ejecución en curso
}
Db::pdo();
$ids = Repo::dueChannelIds();
foreach ($ids as $id) {
    $r = Publisher::run($id, 45);
    fwrite(STDOUT, sprintf("[%s] destino %d → %s%s\n", gmdate('c'), $id, $r['status'] ?? '?', !empty($r['error_message']) ? ' (' . $r['error_message'] . ')' : ''));
}
if (!$ids) {
    fwrite(STDOUT, '');
}
