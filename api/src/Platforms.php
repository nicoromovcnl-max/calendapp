<?php
declare(strict_types=1);

namespace CalendApp;

// Canales de publicación. Solo Instagram está implementado; el resto queda descrito para poder añadirlos
// sin cambiar el modelo (social_accounts.platform + publication_channels).
final class Platforms
{
    private const ALL = [
        'instagram' => [
            'label' => 'Instagram', 'implemented' => true,
            // Requisitos y límites según la documentación oficial de Meta (API de Instagram con inicio de sesión de Instagram).
            'requirements' => [
                'Cuenta profesional de Instagram (Business o Creator). Las cuentas personales no se pueden conectar.',
                'Permisos solicitados: instagram_business_basic e instagram_business_content_publish.',
                'Imágenes en JPEG (máx. 8 MB). Reels en MP4/MOV (3 s–15 min, máx. 300 MB). Stories en vídeo de hasta 60 s (máx. 100 MB).',
                'Texto de hasta 2.200 caracteres, 30 hashtags y 20 menciones. Carruseles de hasta 10 imágenes.',
                'Instagram limita las publicaciones por API cada 24 h; CalendApp consulta la cuota antes de publicar.',
                'El acceso dura 60 días y se renueva automáticamente; si caduca hay que volver a conectar la cuenta.',
                'Meta no permite borrar publicaciones desde la API: eliminarlas en CalendApp no las quita de Instagram.',
            ],
        ],
        'facebook' => ['label' => 'Facebook', 'implemented' => false, 'requirements' => []],
        'tiktok' => ['label' => 'TikTok', 'implemented' => false, 'requirements' => []],
        'linkedin' => ['label' => 'LinkedIn', 'implemented' => false, 'requirements' => []],
    ];

    public static function known(string $platform): bool { return isset(self::ALL[$platform]); }
    public static function implemented(string $platform): bool { return (self::ALL[$platform]['implemented'] ?? false) === true; }
    public static function label(string $platform): string { return self::ALL[$platform]['label'] ?? $platform; }

    public static function all(): array
    {
        $out = [];
        foreach (self::ALL as $id => $p) {
            $out[] = ['id' => $id] + $p;
        }
        return $out;
    }
}
