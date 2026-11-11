-- Banco da conta Lazulium (Cloudflare D1 / SQLite). Aplicar com:
--   npx wrangler d1 execute lazulium-social --remote --file=schema.sql
-- Tudo é idempotente (IF NOT EXISTS): rodar de novo não apaga nada.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  steam_id      TEXT NOT NULL UNIQUE,
  steam_name    TEXT,
  steam_avatar  TEXT,
  custom_name   TEXT,
  settings      TEXT NOT NULL DEFAULT '{}',
  summary       TEXT,                     -- Resumo do perfil enviado pelo app (JSON)
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- Código de uso único entre o retorno da Steam e o app (2 minutos)
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash   TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  state       TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code        TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS invites_user ON invites (user_id);

-- Sempre user_a < user_b: uma linha por amizade
CREATE TABLE IF NOT EXISTS friendships (
  user_a      TEXT NOT NULL,
  user_b      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS friendships_b ON friendships (user_b);

CREATE TABLE IF NOT EXISTS activities (
  user_id     TEXT NOT NULL,
  id          TEXT NOT NULL,              -- Id do evento no app: reenviar atualiza em vez de duplicar
  kind        TEXT NOT NULL,
  game_key    TEXT NOT NULL,
  game_title  TEXT NOT NULL,
  cover_url   TEXT,
  at          TEXT NOT NULL,
  rating      REAL,
  count       INTEGER,
  seconds     INTEGER,
  text        TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS activities_user_at ON activities (user_id, at);

CREATE TABLE IF NOT EXISTS now_playing (
  user_id     TEXT PRIMARY KEY,
  game_key    TEXT NOT NULL,
  game_title  TEXT NOT NULL,
  cover_url   TEXT,
  since       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
