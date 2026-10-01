<?php
declare(strict_types=1);

namespace CalendApp;

// Instagram descarga el archivo desde una URL pública. Los archivos de CalendApp viven en Drive, así que el
// servidor los sirve a través de una URL firmada y de corta duración (media.php) que solo admite orígenes https públicos.
final class Media
{
    public static function normalizeSource(string $url): string
    {
        if (preg_match('~drive\.google\.com/file/d/([\w-]+)~', $url, $m) || (str_contains($url, 'drive.google.com') && preg_match('~[?&]id=([\w-]+)~', $url, $m))) {
            return 'https://drive.google.com/uc?export=download&id=' . $m[1];
        }
        return $url;
    }

    private static function b64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
    private static function unb64(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/')); }

    public static function relayUrl(string $source, int $ttl = 3600): string
    {
        $u = self::b64(self::normalizeSource($source));
        $e = time() + $ttl;
        return Config::appUrl() . 'api/media.php?' . http_build_query(['u' => $u, 'e' => $e, 's' => Crypto::sign("$u|$e")]);
    }

    public static function verify(string $u, int $e, string $s): ?string
    {
        if ($e < time() || !hash_equals(Crypto::sign("$u|$e"), $s)) {
            return null;
        }
        return self::unb64($u);
    }

    public static function isSafeUrl(string $url): bool
    {
        $p = parse_url($url);
        if (!$p || empty($p['host']) || ($p['scheme'] ?? '') !== 'https') {
            return Config::get('MEDIA_ALLOW_PRIVATE') === '1' && in_array($p['scheme'] ?? '', ['http', 'https'], true);
        }
        if (Config::get('MEDIA_ALLOW_PRIVATE') === '1') {
            return true;
        }
        $ips = @gethostbynamel($p['host']) ?: [];
        if (!$ips) {
            return false;
        }
        foreach ($ips as $ip) {
            if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return false;
            }
        }
        return true;
    }

    // Descarga siguiendo redirecciones a mano (cada destino se valida). $sink recibe los fragmentos; devuelve [status, headers].
    public static function download(string $url, callable $sink, ?string $range = null, int $maxBytes = 314572800, ?array &$live = null): array
    {
        $headers = [];
        for ($hop = 0; $hop < 6; $hop++) {
            if (!self::isSafeUrl($url)) {
                throw new \RuntimeException('Origen del archivo no permitido.');
            }
            $headers = [];
            $sent = 0;
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 240, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_USERAGENT => 'CalendApp/2.0',
                CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$headers, &$live) {
                    if (str_contains($h, ':')) { [$k, $v] = explode(':', $h, 2); $headers[strtolower(trim($k))] = trim($v); $live = $headers; }
                    return strlen($h);
                },
                CURLOPT_WRITEFUNCTION => function ($c, $d) use ($sink, &$sent, $maxBytes) {
                    $sent += strlen($d);
                    if ($sent > $maxBytes) { return -1; }
                    return $sink($d) === false ? -1 : strlen($d);
                },
            ]);
            if ($range) { curl_setopt($ch, CURLOPT_RANGE, $range); }
            curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);
            if (in_array($status, [301, 302, 303, 307, 308], true) && !empty($headers['location'])) {
                $url = (string) $headers['location'];
                continue;
            }
            return [$status, $headers];
        }
        throw new \RuntimeException('Demasiadas redirecciones al descargar el archivo.');
    }

    public static function detectType(string $bytes, string $contentType = ''): string
    {
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) { return 'jpeg'; }
        if (str_starts_with($bytes, "\x89PNG")) { return 'png'; }
        if (str_starts_with($bytes, 'GIF8')) { return 'gif'; }
        if (str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP') { return 'webp'; }
        if (substr($bytes, 4, 4) === 'ftyp') { return str_contains(substr($bytes, 8, 4), 'qt') ? 'mov' : 'mp4'; }
        if (str_starts_with($bytes, "\x1A\x45\xDF\xA3")) { return 'webm'; }
        if (stripos($contentType, 'text/html') !== false) { return 'html'; }
        return 'unknown';
    }

    // Clasifica un origen: image|video|youtube|blocked. Lee solo los primeros bytes.
    public static function classify(string $source): array
    {
        $source = self::normalizeSource($source);
        if (preg_match('~(youtube\.com|youtu\.be)~i', $source)) {
            return ['youtube', 'unknown'];
        }
        $buf = '';
        try {
            $r = self::download($source, function ($d) use (&$buf) { $buf .= $d; return strlen($buf) < 4096; }, '0-4095');
        } catch (\Throwable $e) {
            return ['blocked', $e->getMessage()];
        }
        $type = self::detectType($buf, $r[1]['content-type'] ?? '');
        if (in_array($type, ['jpeg', 'png', 'gif', 'webp'], true)) { return ['image', $type]; }
        if (in_array($type, ['mp4', 'mov', 'webm'], true)) { return ['video', $type]; }
        return ['blocked', $type === 'html' ? 'El enlace no devuelve un archivo (¿es público?).' : 'Formato de archivo no reconocido.'];
    }
}
