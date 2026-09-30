<?php
declare(strict_types=1);

namespace CalendApp;

// Cliente de la API de Instagram con inicio de sesión de Instagram (graph.instagram.com).
// Endpoints, parámetros y permisos según la documentación oficial de Meta.
final class Instagram
{
    public const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

    private static function v(string $path): string { return Config::graphBase() . '/' . Config::graphVersion() . '/' . ltrim($path, '/'); }

    private static function call(string $method, string $url, array $params): array
    {
        [$http, $json, $raw] = Http::request($method, $url, $params);
        if ($http >= 400 || ($json && isset($json['error'])) || ($json && isset($json['error_message']))) {
            throw MetaException::fromResponse($http, $json, $raw);
        }
        if ($json === null) {
            throw MetaException::fromResponse($http, null, $raw);
        }
        return $json;
    }

    public static function authorizeUrl(string $state): string
    {
        return Config::oauthAuthorize() . '?' . http_build_query([
            'client_id' => Config::get('META_APP_ID'), 'redirect_uri' => Config::get('META_REDIRECT_URI'),
            'response_type' => 'code', 'scope' => self::SCOPES, 'state' => $state,
        ]);
    }

    // Token de corta duración (1 h). La respuesta documentada es {"data":[{...}]}; se acepta también el formato plano.
    public static function exchangeCode(string $code): array
    {
        $code = preg_replace('/#_$/', '', $code) ?? $code;
        $json = self::call('POST', Config::oauthToken(), [
            'client_id' => Config::get('META_APP_ID'), 'client_secret' => Config::get('META_APP_SECRET'),
            'grant_type' => 'authorization_code', 'redirect_uri' => Config::get('META_REDIRECT_URI'), 'code' => $code,
        ]);
        $row = isset($json['data'][0]) && is_array($json['data'][0]) ? $json['data'][0] : $json;
        if (empty($row['access_token'])) {
            throw new MetaException('Instagram no devolvió un token de acceso.');
        }
        return ['user_id' => (string) ($row['user_id'] ?? ''), 'access_token' => (string) $row['access_token'], 'permissions' => $row['permissions'] ?? null];
    }

    // Token de larga duración (60 días). Solo se puede pedir desde el servidor.
    public static function longLived(string $shortToken): array
    {
        $json = self::call('GET', Config::graphBase() . '/access_token', [
            'grant_type' => 'ig_exchange_token', 'client_secret' => Config::get('META_APP_SECRET'), 'access_token' => $shortToken,
        ]);
        return ['access_token' => (string) $json['access_token'], 'expires_in' => (int) ($json['expires_in'] ?? 5184000)];
    }

    // Renovación: el token debe tener al menos 24 h, seguir vigente y la cuenta haber concedido instagram_business_basic.
    public static function refresh(string $token): array
    {
        $json = self::call('GET', Config::graphBase() . '/refresh_access_token', ['grant_type' => 'ig_refresh_token', 'access_token' => $token]);
        return ['access_token' => (string) $json['access_token'], 'expires_in' => (int) ($json['expires_in'] ?? 5184000)];
    }

    public static function me(string $token): array
    {
        $me = self::call('GET', self::v('me'), ['fields' => 'user_id,username', 'access_token' => $token]);
        $row = isset($me['data'][0]) && is_array($me['data'][0]) ? $me['data'][0] : $me;
        $extra = [];
        try {
            $e = self::call('GET', self::v('me'), ['fields' => 'account_type,profile_picture_url,followers_count,media_count', 'access_token' => $token]);
            $extra = isset($e['data'][0]) && is_array($e['data'][0]) ? $e['data'][0] : $e;
        } catch (MetaException) { /* campos opcionales */ }
        return array_merge($row, $extra);
    }

    public static function createContainer(string $igId, string $token, array $params): string
    {
        $json = self::call('POST', self::v("$igId/media"), $params + ['access_token' => $token]);
        if (empty($json['id'])) {
            throw new MetaException('Instagram no devolvió el identificador del contenedor.');
        }
        return (string) $json['id'];
    }

    public static function containerStatus(string $containerId, string $token): string
    {
        $json = self::call('GET', self::v($containerId), ['fields' => 'status_code', 'access_token' => $token]);
        return (string) ($json['status_code'] ?? 'IN_PROGRESS');
    }

    public static function publish(string $igId, string $token, string $creationId): string
    {
        $json = self::call('POST', self::v("$igId/media_publish"), ['creation_id' => $creationId, 'access_token' => $token]);
        if (empty($json['id'])) {
            throw new MetaException('Instagram no confirmó la publicación.');
        }
        return (string) $json['id'];
    }

    // Uso de la cuota de publicación. El total lo indica Meta en la respuesta (no se fija aquí).
    public static function quota(string $igId, string $token): array
    {
        $json = self::call('GET', self::v("$igId/content_publishing_limit"), ['fields' => 'quota_usage,config', 'access_token' => $token]);
        $row = $json['data'][0] ?? $json;
        return ['usage' => (int) ($row['quota_usage'] ?? 0), 'total' => isset($row['config']['quota_total']) ? (int) $row['config']['quota_total'] : null, 'duration' => (int) ($row['config']['quota_duration'] ?? 86400)];
    }

    public static function permalink(string $mediaId, string $token): ?string
    {
        try {
            $json = self::call('GET', self::v($mediaId), ['fields' => 'permalink', 'access_token' => $token]);
            return isset($json['permalink']) ? (string) $json['permalink'] : null;
        } catch (MetaException) {
            return null;
        }
    }
}
