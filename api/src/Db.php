<?php
declare(strict_types=1);

namespace CalendApp;

// SQLite con migraciones idempotentes. Proyecto ↔ cuenta social ↔ publicación ↔ destino son entidades separadas.
final class Db
{
    private static ?\PDO $pdo = null;

    public static function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

    public static function pdo(): \PDO
    {
        if (self::$pdo) {
            return self::$pdo;
        }
        $path = Config::dbPath();
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0750, true);
        }
        $pdo = new \PDO('sqlite:' . $path, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC]);
        $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
        self::migrate($pdo);
        return self::$pdo = $pdo;
    }

    private static function migrate(\PDO $pdo): void
    {
        $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'instagram',
  external_account_id TEXT,
  username TEXT NOT NULL,
  access_token_enc TEXT,
  token_expires_at TEXT,
  token_refreshed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  connected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (platform, username)
);
CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '[]',
  tipo TEXT NOT NULL DEFAULT 'imagen',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publication_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  social_account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  external_post_id TEXT,
  external_url TEXT,
  container_id TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (publication_id, social_account_id)
);
CREATE INDEX IF NOT EXISTS idx_channels_due ON publication_channels (status, scheduled_at);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY, project_id TEXT, session_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL);
SQL);
        self::seed($pdo);
    }

    // Proyectos y cuentas iniciales (sin credenciales). Se pueden editar después desde la API.
    private static function seed(\PDO $pdo): void
    {
        if ((int) $pdo->query('SELECT COUNT(*) FROM projects')->fetchColumn() > 0) {
            return;
        }
        $file = dirname(__DIR__) . '/seed/projects.json';
        $cfg = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        if (!is_array($cfg)) {
            return;
        }
        $now = self::now();
        $p = $pdo->prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)');
        foreach ($cfg['projects'] ?? [] as $proj) {
            $p->execute([$proj['id'], $proj['name'], $now]);
        }
        $a = $pdo->prepare('INSERT OR IGNORE INTO social_accounts (project_id, platform, username, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($cfg['accounts'] ?? [] as $acc) {
            $a->execute([$acc['projectId'] ?? null, $acc['platform'] ?? 'instagram', strtolower($acc['username']), 'pending', $now, $now]);
        }
    }
}
