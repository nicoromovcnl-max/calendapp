<?php
declare(strict_types=1);

namespace CalendApp;

// Acceso a datos. Los tokens solo se leen aquí (descifrados) para publicar; nunca se serializan hacia el cliente.
final class Repo
{
    private static function db(): \PDO { return Db::pdo(); }

    public static function accountPublic(array $r): array
    {
        $status = $r['status'];
        if ($status === 'connected' && $r['token_expires_at'] && $r['token_expires_at'] < Db::now()) {
            $status = 'expired';
        }
        return [
            'id' => (int) $r['id'], 'project_id' => $r['project_id'], 'platform' => $r['platform'], 'external_account_id' => $r['external_account_id'],
            'username' => $r['username'], 'status' => $status, 'token_expires_at' => $r['token_expires_at'],
            'metadata' => json_decode($r['metadata'] ?: '{}', true) ?: new \stdClass(), 'last_error' => $r['last_error'], 'connected_at' => $r['connected_at'],
        ];
    }

    public static function accounts(): array
    {
        return array_map([self::class, 'accountPublic'], self::db()->query('SELECT * FROM social_accounts ORDER BY username')->fetchAll());
    }

    public static function account(int $id): ?array
    {
        $st = self::db()->prepare('SELECT * FROM social_accounts WHERE id = ?');
        $st->execute([$id]);
        return $st->fetch() ?: null;
    }

    public static function accountByUsername(string $platform, string $username): ?array
    {
        $st = self::db()->prepare('SELECT * FROM social_accounts WHERE platform = ? AND lower(username) = lower(?)');
        $st->execute([$platform, $username]);
        return $st->fetch() ?: null;
    }

    public static function accountByExternal(string $platform, string $external): ?array
    {
        $st = self::db()->prepare('SELECT * FROM social_accounts WHERE platform = ? AND external_account_id = ?');
        $st->execute([$platform, $external]);
        return $st->fetch() ?: null;
    }

    public static function projectExists(?string $id): bool
    {
        if ($id === null || $id === '') {
            return true;
        }
        $st = self::db()->prepare('SELECT 1 FROM projects WHERE id = ?');
        $st->execute([$id]);
        return (bool) $st->fetchColumn();
    }

    public static function projects(): array { return self::db()->query('SELECT id, name FROM projects ORDER BY name')->fetchAll(); }

    public static function addAccount(string $platform, string $username, ?string $projectId): int
    {
        $now = Db::now();
        self::db()->prepare('INSERT INTO social_accounts (project_id, platform, username, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$projectId ?: null, $platform, strtolower($username), 'pending', $now, $now]);
        return (int) self::db()->lastInsertId();
    }

    public static function updateAccount(int $id, array $fields): void
    {
        $fields['updated_at'] = Db::now();
        $sets = implode(', ', array_map(fn ($k) => "$k = :$k", array_keys($fields)));
        $fields['id'] = $id;
        self::db()->prepare("UPDATE social_accounts SET $sets WHERE id = :id")->execute($fields);
    }

    public static function deleteAccount(int $id): void { self::db()->prepare('DELETE FROM social_accounts WHERE id = ?')->execute([$id]); }

    public static function token(array $account): string
    {
        if (empty($account['access_token_enc'])) {
            throw new \RuntimeException('La cuenta no tiene credenciales guardadas. Conéctala primero.');
        }
        return Crypto::decrypt($account['access_token_enc']);
    }

    // ── Publicaciones y destinos ──────────────────────────────────────────
    public static function upsertPublication(string $ref, ?string $previousRef, ?string $projectId, string $title, string $caption, array $media, string $tipo): int
    {
        $db = self::db();
        $now = Db::now();
        $find = $db->prepare('SELECT id FROM publications WHERE ref = ?');
        $find->execute([$ref]);
        $id = $find->fetchColumn();
        if (!$id && $previousRef) {
            $find->execute([$previousRef]);
            $id = $find->fetchColumn();
        }
        $mediaJson = json_encode(array_values($media), JSON_UNESCAPED_SLASHES);
        if ($id) {
            $db->prepare('UPDATE publications SET ref = ?, project_id = ?, title = ?, caption = ?, media = ?, tipo = ?, updated_at = ? WHERE id = ?')
                ->execute([$ref, $projectId, $title, $caption, $mediaJson, $tipo, $now, $id]);
            return (int) $id;
        }
        $db->prepare('INSERT INTO publications (ref, project_id, title, caption, media, tipo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$ref, $projectId, $title, $caption, $mediaJson, $tipo, $now, $now]);
        return (int) $db->lastInsertId();
    }

    // Sincroniza los destinos no publicados con la lista recibida; los publicados no se tocan.
    public static function syncChannels(int $publicationId, array $dests): void
    {
        $db = self::db();
        $now = Db::now();
        $existing = [];
        $st = $db->prepare('SELECT * FROM publication_channels WHERE publication_id = ?');
        $st->execute([$publicationId]);
        foreach ($st->fetchAll() as $r) {
            $existing[(int) $r['social_account_id']] = $r;
        }
        $keep = [];
        foreach ($dests as $d) {
            $accId = (int) $d['social_account_id'];
            $keep[$accId] = true;
            $status = in_array($d['status'], ['draft', 'scheduled'], true) ? $d['status'] : 'draft';
            $when = $status === 'scheduled' ? ($d['scheduled_at'] ?? null) : null;
            if ($status === 'scheduled' && !$when) {
                $status = 'draft';
            }
            if (isset($existing[$accId])) {
                if (in_array($existing[$accId]['status'], ['published', 'publishing'], true)) {
                    continue;
                }
                $db->prepare('UPDATE publication_channels SET status = ?, scheduled_at = ?, error_message = NULL, container_id = NULL, updated_at = ? WHERE id = ?')
                    ->execute([$status, $when, $now, $existing[$accId]['id']]);
            } else {
                $db->prepare('INSERT INTO publication_channels (publication_id, social_account_id, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
                    ->execute([$publicationId, $accId, $status, $when, $now, $now]);
            }
        }
        foreach ($existing as $accId => $r) {
            if (!isset($keep[$accId]) && !in_array($r['status'], ['published', 'publishing'], true)) {
                $db->prepare('DELETE FROM publication_channels WHERE id = ?')->execute([$r['id']]);
            }
        }
    }

    public static function channelPublic(array $r): array
    {
        return [
            'id' => (int) $r['id'], 'ref' => $r['ref'] ?? null, 'publication_id' => (int) $r['publication_id'], 'social_account_id' => (int) $r['social_account_id'],
            'status' => $r['status'], 'scheduled_at' => $r['scheduled_at'], 'published_at' => $r['published_at'], 'external_post_id' => $r['external_post_id'],
            'external_url' => $r['external_url'], 'error_message' => $r['error_message'],
        ];
    }

    public static function channels(?int $publicationId = null): array
    {
        $sql = 'SELECT c.*, p.ref FROM publication_channels c JOIN publications p ON p.id = c.publication_id' . ($publicationId ? ' WHERE c.publication_id = ' . (int) $publicationId : '') . ' ORDER BY c.id';
        return array_map([self::class, 'channelPublic'], self::db()->query($sql)->fetchAll());
    }

    public static function channel(int $id): ?array
    {
        $st = self::db()->prepare('SELECT c.*, p.ref, p.title, p.caption, p.media, p.tipo, p.project_id FROM publication_channels c JOIN publications p ON p.id = c.publication_id WHERE c.id = ?');
        $st->execute([$id]);
        return $st->fetch() ?: null;
    }

    public static function updateChannel(int $id, array $fields): void
    {
        $fields['updated_at'] = Db::now();
        $sets = implode(', ', array_map(fn ($k) => "$k = :$k", array_keys($fields)));
        $fields['id'] = $id;
        self::db()->prepare("UPDATE publication_channels SET $sets WHERE id = :id")->execute($fields);
    }

    // Reserva atómica: evita que dos procesos publiquen el mismo destino.
    public static function claim(int $id, bool $resume = false): bool
    {
        $now = Db::now();
        if ($resume) {
            $st = self::db()->prepare("UPDATE publication_channels SET locked_at = ?, updated_at = ? WHERE id = ? AND status = 'publishing' AND (locked_at IS NULL OR locked_at < ?)");
            $st->execute([$now, $now, $id, gmdate('Y-m-d\TH:i:s\Z', time() - 60)]);
        } else {
            $st = self::db()->prepare("UPDATE publication_channels SET status = 'publishing', locked_at = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status IN ('draft','scheduled','failed')");
            $st->execute([$now, $now, $id]);
        }
        return $st->rowCount() === 1;
    }

    public static function dueChannelIds(): array
    {
        $st = self::db()->prepare("SELECT id FROM publication_channels WHERE (status = 'scheduled' AND scheduled_at <= ?) OR (status = 'publishing' AND container_id IS NOT NULL AND locked_at < ?) ORDER BY scheduled_at");
        $st->execute([Db::now(), gmdate('Y-m-d\TH:i:s\Z', time() - 60)]);
        return array_map('intval', $st->fetchAll(\PDO::FETCH_COLUMN));
    }

    public static function cleanStates(): void { self::db()->prepare('DELETE FROM oauth_states WHERE created_at < ?')->execute([gmdate('Y-m-d\TH:i:s\Z', time() - 900)]); }

    public static function saveState(string $state, ?string $projectId, string $sessionHash): void
    {
        self::cleanStates();
        self::db()->prepare('INSERT INTO oauth_states (state, project_id, session_hash, created_at) VALUES (?, ?, ?, ?)')->execute([$state, $projectId, $sessionHash, Db::now()]);
    }

    public static function consumeState(string $state): ?array
    {
        self::cleanStates();
        $st = self::db()->prepare('SELECT * FROM oauth_states WHERE state = ?');
        $st->execute([$state]);
        $row = $st->fetch() ?: null;
        if ($row) {
            self::db()->prepare('DELETE FROM oauth_states WHERE state = ?')->execute([$state]);
        }
        return $row;
    }
}
