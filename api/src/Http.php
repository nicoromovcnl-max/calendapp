<?php
declare(strict_types=1);

namespace CalendApp;

final class Http
{
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    public static function error(string $code, string $message, int $status = 400): never
    {
        self::json(['ok' => false, 'error' => ['code' => $code, 'message' => $message]], $status);
    }

    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            return [];
        }
        $d = json_decode($raw, true);
        return is_array($d) ? $d : [];
    }

    // Petición saliente (curl). Devuelve [status, json|null, raw].
    public static function request(string $method, string $url, array $params = [], int $timeout = 30): array
    {
        $ch = curl_init();
        $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => ['Accept: application/json']];
        if ($method === 'GET') {
            $url .= ($params ? (str_contains($url, '?') ? '&' : '?') . http_build_query($params) : '');
        } else {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = http_build_query($params);
        }
        $opts[CURLOPT_URL] = $url;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new MetaException('No se pudo contactar con Meta: ' . $err, 0, null, 'network', 0);
        }
        $json = json_decode((string) $raw, true);
        return [$status, is_array($json) ? $json : null, (string) $raw];
    }
}
