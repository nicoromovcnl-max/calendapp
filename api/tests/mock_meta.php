<?php
// Meta simulado SOLO para pruebas locales de integración (no forma parte del despliegue).
// Reproduce la forma de las respuestas documentadas de la API de Instagram con inicio de sesión de Instagram.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$state = '/tmp/calendapp_mock_state.json';
$st = is_file($state) ? json_decode(file_get_contents($state), true) : ['n' => 0, 'published' => [], 'calls' => []];
$save = function () use (&$st, $state) { file_put_contents($state, json_encode($st)); };
$out = function ($d, $code = 200) { http_response_code($code); header('Content-Type: application/json'); echo json_encode($d); exit; };
$st['calls'][] = $_SERVER['REQUEST_METHOD'] . ' ' . $path; $save();

if (str_starts_with($path, '/files/')) {
    if (str_ends_with($path, '.jpg')) { header('Content-Type: image/jpeg'); echo "\xFF\xD8\xFF\xE0" . str_repeat('J', 2000); exit; }
    if (str_ends_with($path, '.png')) { header('Content-Type: image/png'); echo "\x89PNG\r\n\x1a\n" . str_repeat('P', 500); exit; }
    if (str_ends_with($path, '.mp4')) { header('Content-Type: video/mp4'); echo "\x00\x00\x00\x18ftypmp42" . str_repeat('V', 4000); exit; }
    header('Content-Type: text/html'); echo '<html>login</html>'; exit;
}
if (is_file('/tmp/calendapp_mock_fail_auth')) {
    $out(['error' => ['message' => 'Error validating access token: Session has expired', 'type' => 'OAuthException', 'code' => 190]], 400);
}
if ($path === '/oauth/access_token') {
    $code = $_POST['code'] ?? '';
    if ($_POST['client_secret'] !== 'test-secret' || $_POST['grant_type'] !== 'authorization_code') { $out(['error_type' => 'OAuthException', 'code' => 400, 'error_message' => 'Invalid client secret'], 400); }
    $out(['data' => [['access_token' => 'SHORT_' . $code, 'user_id' => '178414' . strlen($code), 'permissions' => 'instagram_business_basic,instagram_business_content_publish']]]);
}
if ($path === '/access_token') { $out(['access_token' => 'LONG_' . substr($_GET['access_token'], 6), 'token_type' => 'bearer', 'expires_in' => 5184000]); }
if ($path === '/refresh_access_token') { $out(['access_token' => 'LONG_REFRESHED', 'token_type' => 'bearer', 'expires_in' => 5184000]); }
if (preg_match('#^/v25\.0/me$#', $path)) {
    $tok = $_GET['access_token'] ?? '';
    $who = str_contains($tok, 'corfu') ? 'teatrocorfu7' : (str_contains($tok, 'personal') ? 'cuenta.personal' : 'clubtemeraria');
    $type = str_contains($tok, 'personal') ? 'PERSONAL' : 'BUSINESS';
    $f = $_GET['fields'] ?? '';
    $r = ['user_id' => '17841' . strlen($who), 'username' => $who];
    if (str_contains($f, 'account_type')) { $r += ['account_type' => $type, 'followers_count' => 1234, 'media_count' => 56]; unset($r['user_id'], $r['username']); }
    $out($r);
}
if (preg_match('#^/v25\.0/(\d+)/media$#', $path, $m)) {
    $img = $_POST['image_url'] ?? null; $vid = $_POST['video_url'] ?? null; $url = $img ?: $vid;
    if (!$url && ($_POST['media_type'] ?? '') !== 'CAROUSEL') { $out(['error' => ['message' => 'Missing media', 'type' => 'OAuthException', 'code' => 100]], 400); }
    if ($url) { // Meta descarga la URL: comprobamos que el relé sirve un JPEG o un MP4 real
        $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 10]);
        $resp = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
        $ct = ''; if (preg_match('/content-type:\s*([^\r\n]+)/i', (string) $resp, $mm)) { $ct = strtolower(trim($mm[1])); }
        if ($code !== 200 || !(str_starts_with($ct, 'image/jpeg') || str_starts_with($ct, 'video/'))) {
            $out(['error' => ['message' => 'Media download failed', 'type' => 'OAuthException', 'code' => -2, 'error_subcode' => 2207003]], 400);
        }
    }
    $st['n']++; $st['containers'][(string) $st['n']] = $_POST; $save();
    $out(['id' => 'C' . $st['n']]);
}
if (preg_match('#^/v25\.0/C(\d+)$#', $path, $m)) {
    $st['polls'][$m[1]] = ($st['polls'][$m[1]] ?? 0) + 1; $save();
    $c = $st['containers'][$m[1]] ?? [];
    $slow = ($c['media_type'] ?? '') === 'REELS' && $st['polls'][$m[1]] < 2;
    $out(['status_code' => $slow ? 'IN_PROGRESS' : 'FINISHED', 'id' => 'C' . $m[1]]);
}
if (preg_match('#^/v25\.0/(\d+)/media_publish$#', $path)) {
    $cid = $_POST['creation_id'] ?? '';
    if (!preg_match('/^C\d+$/', $cid)) { $out(['error' => ['message' => 'Invalid creation_id', 'type' => 'OAuthException', 'code' => 24]], 400); }
    $id = 'M' . (count($st['published']) + 1); $st['published'][] = ['id' => $id, 'creation' => $cid]; $save();
    $out(['id' => $id]);
}
if (preg_match('#^/v25\.0/(\d+)/content_publishing_limit$#', $path)) { $out(['data' => [['quota_usage' => count($st['published']), 'config' => ['quota_total' => 50, 'quota_duration' => 86400]]]]); }
if (preg_match('#^/v25\.0/M(\d+)$#', $path, $m)) { $out(['permalink' => 'https://www.instagram.com/p/mock' . $m[1] . '/', 'id' => 'M' . $m[1]]); }
$out(['error' => ['message' => 'Unknown mock path ' . $path, 'type' => 'GraphMethodException', 'code' => 100]], 404);
