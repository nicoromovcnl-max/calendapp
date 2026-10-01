<?php
declare(strict_types=1);

namespace CalendApp;

// Publicación en Instagram: contenedor → (espera) → media_publish. Usado por la API (manual) y por cron (programada).
final class Publisher
{
    private static function fail(int $channelId, string $message, ?array $account = null, ?MetaException $e = null): array
    {
        Repo::updateChannel($channelId, ['status' => 'failed', 'error_message' => mb_substr($message, 0, 500), 'locked_at' => null]);
        Repo::logEvent($channelId, 'failed', mb_substr($message, 0, 500));
        if ($account && $e && $e->isAuthError()) {
            Repo::updateAccount((int) $account['id'], ['status' => 'expired', 'last_error' => mb_substr($e->userMessage(), 0, 300)]);
        }
        return Repo::channelPublic(Repo::channel($channelId) ?? []);
    }

    public static function run(int $channelId, int $maxWait = 60): array
    {
        $ch = Repo::channel($channelId);
        if (!$ch) {
            throw new \RuntimeException('Destino no encontrado.');
        }
        $resume = $ch['status'] === 'publishing' && !empty($ch['container_id']);
        if (!Repo::claim($channelId, $resume)) {
            return Repo::channelPublic($ch);
        }
        $ch = Repo::channel($channelId);
        $account = Repo::account((int) $ch['social_account_id']);
        Repo::logEvent($channelId, $resume ? 'resumed' : 'publishing', $resume ? 'Se retoma la publicación' : 'Publicando…');
        try {
            if (!$account) {
                throw new \RuntimeException('La cuenta de destino no existe.');
            }
            if (!Platforms::implemented($account['platform'])) {
                throw new \RuntimeException('El canal ' . Platforms::label($account['platform']) . ' todavía no está disponible en CalendApp.');
            }
            $public = Repo::accountPublic($account);
            if ($public['status'] !== 'connected' || empty($account['external_account_id'])) {
                throw new \RuntimeException('La cuenta @' . $account['username'] . ' no está conectada (estado: ' . $public['status'] . '). Conéctala en Ajustes → Integraciones.');
            }
            $token = Repo::token($account);
            $ig = (string) $account['external_account_id'];

            if (empty($ch['container_id'])) {
                self::checkQuota($ig, $token);
                $creation = self::createContainer($ch, $ig, $token);
                Repo::updateChannel($channelId, ['container_id' => $creation]);
            } else {
                $creation = (string) $ch['container_id'];
            }

            $status = self::wait($creation, $token, $maxWait);
            if ($status === 'IN_PROGRESS') {
                return Repo::channelPublic(Repo::channel($channelId) ?? []); // seguirá en "publishing"; cron lo retoma
            }
            $mediaId = Instagram::publish($ig, $token, $creation);
            Repo::updateChannel($channelId, [
                'status' => 'published', 'published_at' => Db::now(), 'external_post_id' => $mediaId,
                'external_url' => Instagram::permalink($mediaId, $token), 'error_message' => null, 'locked_at' => null,
            ]);
            Repo::logEvent($channelId, 'published', 'Publicado en @' . $account['username']);
            return Repo::channelPublic(Repo::channel($channelId) ?? []);
        } catch (MetaException $e) {
            return self::fail($channelId, $e->userMessage(), $account, $e);
        } catch (\Throwable $e) {
            return self::fail($channelId, $e->getMessage(), $account);
        }
    }

    private static function checkQuota(string $ig, string $token): void
    {
        try {
            $q = Instagram::quota($ig, $token);
        } catch (MetaException) {
            return; // la comprobación es informativa; la API rechazará si se supera
        }
        if ($q['total'] !== null && $q['usage'] >= $q['total']) {
            throw new \RuntimeException("Se alcanzó el límite de publicaciones de Instagram ({$q['usage']} de {$q['total']} en " . round($q['duration'] / 3600) . ' h). Inténtalo más tarde.');
        }
    }

    // Espera a que el contenedor esté listo. Devuelve FINISHED o IN_PROGRESS (si se agota el tiempo).
    private static function wait(string $containerId, string $token, int $maxWait): string
    {
        $deadline = time() + $maxWait;
        do {
            $s = Instagram::containerStatus($containerId, $token);
            if ($s === 'FINISHED') { return 'FINISHED'; }
            if ($s === 'ERROR') { throw new \RuntimeException('Instagram no pudo procesar el archivo multimedia (estado ERROR). Revisa el formato y vuelve a intentarlo.'); }
            if ($s === 'EXPIRED') { throw new \RuntimeException('El contenedor caducó antes de publicarse. Vuelve a intentarlo.'); }
            if ($s === 'PUBLISHED') { return 'FINISHED'; }
            if (time() >= $deadline) { return 'IN_PROGRESS'; }
            sleep(2);
        } while (true);
    }

    private static function validateCaption(string $caption): void
    {
        if (mb_strlen($caption) > 2200) { throw new \RuntimeException('El texto supera los 2.200 caracteres que admite Instagram.'); }
        if (preg_match_all('/#[\p{L}\p{N}_]+/u', $caption) > 30) { throw new \RuntimeException('Instagram admite un máximo de 30 hashtags.'); }
        if (preg_match_all('/@[\w.]+/u', $caption) > 20) { throw new \RuntimeException('Instagram admite un máximo de 20 menciones.'); }
    }

    private static function source(string $url, string $expect): string
    {
        [$kind, $detail] = Media::classify($url);
        if ($kind === 'youtube') { throw new \RuntimeException('Los enlaces de YouTube no se pueden publicar en Instagram: sube el archivo de vídeo.'); }
        if ($kind === 'blocked') { throw new \RuntimeException('No se puede usar el archivo multimedia: ' . $detail); }
        if ($kind !== $expect) { throw new \RuntimeException($expect === 'image' ? 'Este contenido necesita una imagen y el archivo es un vídeo.' : 'Este contenido necesita un vídeo y el archivo es una imagen.'); }
        if ($expect === 'image' && !in_array($detail, ['jpeg', 'png', 'webp', 'gif'], true)) { throw new \RuntimeException('Formato de imagen no compatible.'); }
        return Media::relayUrl($url);
    }

    private static function createContainer(array $ch, string $ig, string $token): string
    {
        $media = json_decode($ch['media'] ?: '[]', true) ?: [];
        $caption = (string) $ch['caption'];
        $tipo = (string) $ch['tipo'];
        if (!$media || $tipo === 'texto') {
            throw new \RuntimeException('Instagram necesita una imagen o un vídeo para publicar.');
        }
        self::validateCaption($caption);

        switch ($tipo) {
            case 'carrusel':
                if (count($media) > 10) { throw new \RuntimeException('Un carrusel admite un máximo de 10 archivos.'); }
                $children = [];
                foreach ($media as $m) {
                    [$kind] = Media::classify($m);
                    if ($kind === 'video') { throw new \RuntimeException('Los carruseles con vídeo todavía no están soportados por CalendApp: usa solo imágenes.'); }
                    $children[] = Instagram::createContainer($ig, $token, ['image_url' => self::source($m, 'image'), 'is_carousel_item' => 'true']);
                }
                foreach ($children as $c) { self::wait($c, $token, 30); }
                return Instagram::createContainer($ig, $token, ['media_type' => 'CAROUSEL', 'children' => implode(',', $children), 'caption' => $caption]);
            case 'reel':
            case 'video':
                return Instagram::createContainer($ig, $token, ['media_type' => 'REELS', 'video_url' => self::source($media[0], 'video'), 'caption' => $caption]);
            case 'historia':
                [$kind] = Media::classify($media[0]);
                return $kind === 'video'
                    ? Instagram::createContainer($ig, $token, ['media_type' => 'STORIES', 'video_url' => self::source($media[0], 'video')])
                    : Instagram::createContainer($ig, $token, ['media_type' => 'STORIES', 'image_url' => self::source($media[0], 'image')]);
            default: // imagen
                return Instagram::createContainer($ig, $token, ['image_url' => self::source($media[0], 'image'), 'caption' => $caption]);
        }
    }
}
