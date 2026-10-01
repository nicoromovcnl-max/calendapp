<?php
declare(strict_types=1);

namespace CalendApp;

// Cifrado de tokens en reposo (libsodium secretbox) con la clave APP_KEY (32 bytes en base64).
final class Crypto
{
    private static function key(): ?string
    {
        $k = base64_decode(Config::get('APP_KEY'), true);
        return ($k !== false && strlen($k) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES) ? $k : null;
    }

    public static function available(): bool
    {
        return function_exists('sodium_crypto_secretbox') && self::key() !== null;
    }

    public static function encrypt(string $plain): string
    {
        $key = self::key();
        if ($key === null) {
            throw new \RuntimeException('APP_KEY no está configurada: no se pueden guardar tokens.');
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $key));
    }

    public static function decrypt(string $blob): string
    {
        $key = self::key();
        $raw = base64_decode($blob, true);
        if ($key === null || $raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            throw new \RuntimeException('No se pudo descifrar el token guardado.');
        }
        $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $key);
        if ($plain === false) {
            throw new \RuntimeException('El token guardado no se pudo descifrar (¿cambió APP_KEY?).');
        }
        return $plain;
    }

    // Firma HMAC para URLs de medios; usa la misma clave.
    public static function sign(string $data): string
    {
        $key = self::key();
        if ($key === null) {
            throw new \RuntimeException('APP_KEY no está configurada.');
        }
        return hash_hmac('sha256', $data, $key);
    }
}
