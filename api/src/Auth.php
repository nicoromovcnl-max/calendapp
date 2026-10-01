<?php
declare(strict_types=1);

namespace CalendApp;

// Sesión de administración del servidor. No depende de la contraseña del cliente.
final class Auth
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        session_name('calendapp_sid');
        session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $https]);
        session_start();
    }

    public static function check(): bool
    {
        self::start();
        return !empty($_SESSION['admin']);
    }

    public static function require(): void
    {
        if (!self::check()) {
            Http::error('unauthorized', 'Inicia sesión en el servidor para continuar.', 401);
        }
    }

    // Protección CSRF para peticiones que modifican datos: cabecera propia + JSON (no enviables desde un formulario ajeno).
    public static function requireCsrf(): void
    {
        if (($_SERVER['HTTP_X_CALENDAPP'] ?? '') !== '1' || stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === false) {
            Http::error('csrf', 'Petición no válida.', 403);
        }
    }

    public static function login(string $password): bool
    {
        $pdo = Db::pdo();
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
        $pdo->prepare('DELETE FROM login_attempts WHERE at < ?')->execute([time() - 900]);
        $st = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ?');
        $st->execute([$ip]);
        if ((int) $st->fetchColumn() >= 8) {
            Http::error('rate_limited', 'Demasiados intentos. Espera unos minutos.', 429);
        }
        $hash = Config::get('ADMIN_PASSWORD_HASH');
        $plain = Config::get('ADMIN_PASSWORD');
        $ok = $hash !== '' ? password_verify($password, $hash) : ($plain !== '' && hash_equals($plain, $password));
        if (!$ok) {
            $pdo->prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)')->execute([$ip, time()]);
            usleep(700000);
            return false;
        }
        self::start();
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        return true;
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        session_destroy();
    }

    public static function sessionHash(): string
    {
        self::start();
        return hash('sha256', session_id());
    }
}
