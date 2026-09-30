<?php
declare(strict_types=1);

namespace CalendApp;

final class MetaException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $metaCode = 0, public readonly ?int $subcode = null, public readonly string $type = '', public readonly int $http = 0)
    {
        parent::__construct($message);
    }

    public static function fromResponse(int $http, ?array $json, string $raw): self
    {
        $e = $json['error'] ?? null;
        if (is_array($e)) {
            return new self((string) ($e['error_user_msg'] ?? $e['message'] ?? 'Error de la API de Meta'), (int) ($e['code'] ?? 0), isset($e['error_subcode']) ? (int) $e['error_subcode'] : null, (string) ($e['type'] ?? ''), $http);
        }
        // Los endpoints de OAuth de Instagram devuelven error_type / error_message.
        if (is_array($json) && isset($json['error_message'])) {
            return new self((string) $json['error_message'], (int) ($json['code'] ?? 0), null, (string) ($json['error_type'] ?? ''), $http);
        }
        return new self('Respuesta inesperada de Meta (HTTP ' . $http . '): ' . mb_substr($raw, 0, 200), 0, null, '', $http);
    }

    // El token ya no sirve y hay que volver a conectar la cuenta.
    public function isAuthError(): bool
    {
        return $this->type === 'OAuthException' || $this->metaCode === 190;
    }

    // Mensaje pensado para la persona que usa CalendApp (códigos de la documentación oficial de Meta).
    public function userMessage(): string
    {
        return match ($this->subcode) {
            2207027 => 'El archivo aún no está listo para publicarse. Inténtalo de nuevo en unos instantes.',
            2207003 => 'Instagram tardó demasiado en descargar el archivo multimedia.',
            2207026 => 'El formato de vídeo no es compatible con Instagram (usa MP4 o MOV con H.264/HEVC y audio AAC).',
            2207004 => 'La imagen es demasiado grande para Instagram (máximo 8 MB).',
            2207032 => 'Instagram no pudo crear el contenido. Vuelve a intentarlo.',
            default => $this->isAuthError()
                ? 'Instagram rechazó las credenciales de la cuenta. Vuelve a conectarla en Ajustes → Integraciones. (' . $this->getMessage() . ')'
                : ($this->metaCode === 24 ? 'El contenedor de publicación ha caducado. Vuelve a intentarlo.' : $this->getMessage()),
        };
    }
}
