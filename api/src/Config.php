<?php
declare(strict_types=1);

namespace CalendApp;

// Configuración: variables de entorno primero, después api/config.local.php.
final class Config
{
    private static ?array $file = null;

    public static function get(string $key, string $default = ''): string
    {
        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        if (self::$file === null) {
            $path = dirname(__DIR__) . '/config.local.php';
            self::$file = is_file($path) ? (array) (require $path) : [];
        }
        $v = self::$file[$key] ?? '';
        return $v !== '' && $v !== null ? (string) $v : $default;
    }

    public static function graphVersion(): string { return self::get('META_GRAPH_VERSION', 'v25.0'); }
    // Los hosts se pueden sustituir por variables de entorno solo para pruebas locales con un Meta simulado.
    public static function graphBase(): string { return rtrim(self::get('META_GRAPH_BASE', 'https://graph.instagram.com'), '/'); }
    public static function oauthAuthorize(): string { return self::get('META_OAUTH_AUTHORIZE', 'https://www.instagram.com/oauth/authorize'); }
    public static function oauthToken(): string { return self::get('META_OAUTH_TOKEN', 'https://api.instagram.com/oauth/access_token'); }
    public static function dbPath(): string { return self::get('DB_PATH', dirname(__DIR__) . '/data/calendapp.sqlite'); }

    public static function appUrl(): string
    {
        $u = self::get('APP_URL');
        if ($u !== '') {
            return rtrim($u, '/') . '/';
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $dir = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/\\');
        return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir . '/';
    }

    public static function flags(): array
    {
        return [
            'meta_app' => self::get('META_APP_ID') !== '' && self::get('META_APP_SECRET') !== '',
            'redirect_uri' => self::get('META_REDIRECT_URI') !== '',
            'crypto' => Crypto::available(),
            'admin' => self::get('ADMIN_PASSWORD') !== '' || self::get('ADMIN_PASSWORD_HASH') !== '',
        ];
    }
}
