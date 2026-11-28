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

-- Vitrine do perfil (o mesmo JSON do perfil web) e imagens escolhidas pela pessoa (avatar, fundo, arte)
CREATE TABLE IF NOT EXISTS showcases (
  user_id     TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  token       TEXT PRIMARY KEY,           -- Endereço público difícil de adivinhar; muda a cada envio
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,              -- Base64
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS media_user ON media (user_id, kind);

-- GIF maior e vídeo de fundo ficam em disco na VPS (src/media-store.js), não aqui. Esta tabela só anota quem tem
-- arquivo lá, para apagar junto com a conta. purge = 1: pedido de apagar que a VPS ainda não confirmou
-- (a linha sobrevive à conta até a VPS confirmar; só tem o id aleatório da conta e o tipo).
CREATE TABLE IF NOT EXISTS stored_media (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  purge       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

-- Link temporário para um amigo ver a vitrine (a página não recebe o token da conta)
CREATE TABLE IF NOT EXISTS view_links (
  token       TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

-- Status escolhido no app (como no Discord). invisible: os amigos veem a pessoa off-line, sem "jogando agora".
-- until: a escolha com prazo volta sozinha para online. auto = 1: Ausente posto pelo app (PC parado).
CREATE TABLE IF NOT EXISTS presence (
  user_id     TEXT PRIMARY KEY,
  status      TEXT NOT NULL,
  until       TEXT,
  auto        INTEGER NOT NULL DEFAULT 0,
  since       TEXT NOT NULL,              -- Desde quando está neste status (Invisível: vira o "visto por último")
  updated_at  TEXT NOT NULL
);

-- "Chamar pra call": o amigo recebe na próxima consulta; some depois de um dia
CREATE TABLE IF NOT EXISTS calls (
  id            TEXT PRIMARY KEY,
  from_id       TEXT NOT NULL,
  to_id         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  delivered_at  TEXT,
  answer        TEXT,                     -- yes | no | busy (de quem recebeu) ou cancelled (quem chamou desligou)
  answered_at   TEXT,
  answer_seen   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS calls_to ON calls (to_id, created_at);
CREATE INDEX IF NOT EXISTS calls_from ON calls (from_id, created_at);

-- Biblioteca resumida: um registro por jogo com alguma atividade (horas, Diário ou conquista), para a página do
-- jogo mostrar os amigos que jogaram. title_key junta lojas diferentes; steam_key acha pelo AppID quando o nome muda.
-- ach_ids: { id da conquista: segundos Unix de quando desbloqueou (0 = sem data) }. Só com a vitrine ligada.
-- Imagens das resenhas (3.3): uma linha por imagem. image_id é o nome do arquivo no app (hash do conteúdo):
-- o mesmo arquivo enviado de novo (outro PC) não duplica. token é o endereço público, difícil de adivinhar.
-- Bancos criados antes da 3.3: rode também migrations/2026-11-review-images.sql (coluna review_images acima).
CREATE TABLE IF NOT EXISTS review_images (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  image_id    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,              -- Base64
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, image_id)
);

CREATE TABLE IF NOT EXISTS library_games (
  user_id       TEXT NOT NULL,
  title_key     TEXT NOT NULL,
  steam_key     TEXT,
  title         TEXT NOT NULL,
  cover_url     TEXT,
  seconds       INTEGER,
  last_played   TEXT,
  status        TEXT,
  rating        REAL,
  review        TEXT,
  review_at     TEXT,
  review_images TEXT,                       -- JSON [{at, t (token da imagem), w, h}]: imagens no meio da resenha
  ach_source    TEXT,
  ach_unlocked  INTEGER,
  ach_total     INTEGER,
  ach_ids       TEXT,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, title_key)
);
CREATE INDEX IF NOT EXISTS library_games_title ON library_games (title_key);
CREATE INDEX IF NOT EXISTS library_games_steam ON library_games (steam_key);

-- Curtidas e comentários em resenhas (target = t:<jogo>) e listas (target = id da lista). Só entre amigos do dono.
-- target_title: nome do jogo ou da lista na hora, para os avisos ("curtiu sua resenha de Hades")
CREATE TABLE IF NOT EXISTS reactions (
  owner_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- review | list
  target        TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  target_title  TEXT,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (owner_id, kind, target, user_id)
);
CREATE INDEX IF NOT EXISTS reactions_owner_at ON reactions (owner_id, created_at);
CREATE INDEX IF NOT EXISTS reactions_user ON reactions (user_id);

CREATE TABLE IF NOT EXISTS comments (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  target        TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  text          TEXT NOT NULL,
  target_title  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_target ON comments (owner_id, kind, target, created_at);
CREATE INDEX IF NOT EXISTS comments_owner_at ON comments (owner_id, created_at);
CREATE INDEX IF NOT EXISTS comments_user ON comments (user_id, created_at);

-- Quem abriu a vitrine por um link (a página curte e comenta como essa pessoa)
CREATE TABLE IF NOT EXISTS view_viewers (
  token       TEXT PRIMARY KEY,
  viewer_id   TEXT NOT NULL
);

-- Listas em grupo: criadas por quem é dono, compartilhadas com amigos
CREATE TABLE IF NOT EXISTS group_lists (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ranked      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_group_lists_owner ON group_lists(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS group_list_members (
  list_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  added_at    TEXT NOT NULL,
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_list_members_user ON group_list_members(user_id);

CREATE TABLE IF NOT EXISTS group_list_items (
  list_id     TEXT NOT NULL,
  title_key   TEXT NOT NULL,
  steam_key   TEXT,
  title       TEXT NOT NULL,
  cover_url   TEXT,
  position    INTEGER NOT NULL,
  added_by    TEXT,
  added_at    TEXT NOT NULL,
  PRIMARY KEY (list_id, title_key)
);
CREATE INDEX IF NOT EXISTS idx_group_list_items_order ON group_list_items(list_id, position, added_at);

-- "Dar um tempo" com um amigo: só quem silenciou sabe. until NULL = até desfazer.
-- Enquanto vale, o que o amigo faz some do feed de quem silenciou, e os avisos e chamados dele não chegam.
CREATE TABLE IF NOT EXISTS friend_mutes (
  user_id     TEXT NOT NULL,
  friend_id   TEXT NOT NULL,
  until       TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

-- Bloqueio: a amizade acaba e nenhum convite entre os dois vale até quem bloqueou desfazer
CREATE TABLE IF NOT EXISTS blocks (
  user_id     TEXT NOT NULL,
  blocked_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked ON blocks (blocked_id);

-- Sincronização privada entre PCs do próprio jogador (ninguém além do dono lê)
CREATE TABLE IF NOT EXISTS user_sync (
  user_id     TEXT PRIMARY KEY,
  revision    INTEGER NOT NULL DEFAULT 1,
  data        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
