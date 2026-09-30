<?php
declare(strict_types=1);

// Sirve archivos multimedia a Instagram mediante URL firmada y de corta duración.
require __DIR__ . '/src/autoload.php';

use CalendApp\Media;

$src = null;
try {
    $src = Media::verify((string) ($_GET['u'] ?? ''), (int) ($_GET['e'] ?? 0), (string) ($_GET['s'] ?? ''));
} catch (Throwable) {
}
if ($src === null) {
    http_response_code(403);
    exit;
}

@set_time_limit(300);
$buf = '';
$mode = null; // null = decidiendo, 'pass' = enviar tal cual, 'convert' = convertir a JPEG
$live = [];
$type = '';
$status = 0;
try {
    Media::download($src, function ($chunk) use (&$buf, &$mode, &$type, &$live) {
        if ($mode === null) {
            $buf .= $chunk;
            if (strlen($buf) < 12) {
                return true;
            }
            $type = Media::detectType($buf, $live['content-type'] ?? '');
            if (in_array($type, ['png', 'webp', 'gif'], true) && function_exists('imagecreatefromstring')) {
                $mode = 'convert';
                return true;
            }
            if (in_array($type, ['jpeg', 'mp4', 'mov', 'webm'], true) || in_array($type, ['png', 'webp', 'gif'], true)) {
                $mode = 'pass';
                header('Content-Type: ' . match ($type) { 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'mov' => 'video/quicktime', 'webm' => 'video/webm', default => 'video/mp4' });
                if (isset($live['content-length'])) { header('Content-Length: ' . $live['content-length']); }
                header('Cache-Control: private, max-age=600');
                echo $buf;
                $buf = '';
                return true;
            }
            http_response_code(415);
            return false;
        }
        if ($mode === 'convert') {
            $buf .= $chunk;
            return strlen($buf) <= 20971520;
        }
        echo $chunk;
        return true;
    }, null, 314572800, $live);
    if ($mode === 'convert' && $buf !== '') {
        $img = @imagecreatefromstring($buf);
        if ($img === false) {
            http_response_code(415);
            exit;
        }
        header('Content-Type: image/jpeg');
        header('Cache-Control: private, max-age=600');
        imagejpeg($img, null, 90);
    } elseif ($mode === null) {
        http_response_code(502);
    }
} catch (Throwable $e) {
    error_log('[calendapp media] ' . $e->getMessage());
    if (!headers_sent()) { http_response_code(502); }
}
