<?php
// CalendApp — Proxy Drive (curl only)

$id      = $_GET['id']   ?? '';
$thumb   = isset($_GET['thumb']);  // ?thumb para pedir solo miniatura

if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) {
    http_response_code(400); die('ID invalido');
}

$cookieFile = sys_get_temp_dir() . '/gdrive_' . md5($id) . '.txt';

// ── THUMBNAIL ─────────────────────────────────────────────────────────────
// Google expone una URL de thumbnail para cualquier archivo de Drive
// Funciona para imágenes Y vídeos (genera frame)
if ($thumb) {
    $thumbUrl = "https://drive.google.com/thumbnail?id={$id}&sz=w800";
    $ch = curl_init($thumbUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_COOKIEJAR      => $cookieFile,
        CURLOPT_COOKIEFILE     => $cookieFile,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        CURLOPT_HEADER         => true,
    ]);
    $response  = curl_exec($ch);
    $headerLen = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $body = substr($response, $headerLen);

    // Si es imagen válida (no HTML)
    if (strlen($body) > 500 && stripos($body, '<!DOCTYPE') === false) {
        header('Content-Type: image/jpeg');
        header('Access-Control-Allow-Origin: https://elchandriogroup.com');
        header('Cache-Control: public, max-age=86400');
        echo $body;
        exit;
    }

    // Si no pudo obtener thumbnail, devolver 404
    http_response_code(404);
    exit;
}

// ── ARCHIVO COMPLETO (vídeo/imagen) ───────────────────────────────────────
function curlGet($url, $cookieFile) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 10,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_COOKIEJAR      => $cookieFile,
        CURLOPT_COOKIEFILE     => $cookieFile,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        CURLOPT_HEADER         => true,
        CURLOPT_ENCODING       => '',
    ]);
    $response  = curl_exec($ch);
    $headerLen = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return [
        'headers' => substr($response, 0, $headerLen),
        'body'    => substr($response, $headerLen),
    ];
}

$url1   = "https://drive.google.com/uc?export=download&id={$id}";
$result = curlGet($url1, $cookieFile);

// Página de confirmación → reintentar con token
if (stripos($result['body'], '<!DOCTYPE') !== false || stripos($result['body'], '<html') !== false) {
    $confirm = '';
    if (preg_match('/[?&]confirm=([0-9A-Za-z_\-]+)/', $result['body'], $m) ||
        preg_match('/confirm=([0-9A-Za-z_\-]+)/', $result['headers'], $m)) {
        $confirm = $m[1];
    }
    $uuid = '';
    if (preg_match('/uuid=([0-9A-Za-z_\-]+)/', $result['body'], $m2)) {
        $uuid = $m2[1];
    }
    $url2 = "https://drive.google.com/uc?export=download&id={$id}";
    if ($confirm) $url2 .= "&confirm={$confirm}";
    if ($uuid)    $url2 .= "&uuid={$uuid}";
    $result = curlGet($url2, $cookieFile);
}

if (stripos($result['body'], '<!DOCTYPE') !== false || strlen($result['body']) < 100) {
    http_response_code(502);
    header('Content-Type: text/plain');
    die('Drive no permitio acceso. Comprueba permisos publicos.');
}

$contentType = 'video/mp4';
foreach (explode("\n", $result['headers']) as $h) {
    if (stripos($h, 'Content-Type:') === 0) {
        $ct = trim(substr($h, 13));
        if ($ct && stripos($ct, 'text/html') === false) {
            $contentType = $ct; break;
        }
    }
}

header('Content-Type: ' . $contentType);
header('Access-Control-Allow-Origin: https://elchandriogroup.com');
header('Cache-Control: public, max-age=3600');
header('Content-Length: ' . strlen($result['body']));
echo $result['body'];
