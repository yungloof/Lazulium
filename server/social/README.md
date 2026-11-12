# Servidor da conta Lazulium (amigos e feed)

Cloudflare Worker com banco D1. Guarda só o que aparece para os amigos: nome e avatar públicos da Steam, eventos do feed, "jogando agora", resumo do perfil, amizades e convites. O que cada pessoa escolhe mostrar está em `users.settings` e é respeitado aqui, além do app. Política para o jogador: [`docs/privacidade.md`](../../docs/privacidade.md), seção 4.

## Publicar (Cloudflare)

```powershell
cd server\social
npx wrangler@latest d1 create lazulium-social
```

Copie o `database_id` que aparecer para o `wrangler.toml` e depois:

```powershell
npx wrangler@latest d1 execute lazulium-social --remote --file=schema.sql
npx wrangler@latest deploy
```

O endereço (`https://lazulium-social.<conta>.workers.dev`) vai em `SOCIAL_SERVER_URL`, em `src/main/services/social/social.service.ts`. Para testar o app com outro servidor: `LAZULIUM_SOCIAL_URL`.

Não há segredos: o login é confirmado pela própria Steam (OpenID `check_authentication`).

## Rodar fora da Cloudflare (VPS ou teste)

```bash
SOCIAL_DB=./social.db PORT=3100 PUBLIC_ORIGIN=https://seu-dominio node server.mjs
```

Mesmo código do Worker, com o SQLite do Node (22.5+) no lugar do D1 (`src/d1-sqlite.js`). `PUBLIC_ORIGIN` precisa ser o endereço público com HTTPS, porque é para ele que a Steam devolve o login.

## Testes

```bash
npm test
```

A Steam é simulada; o banco é SQLite em memória com o mesmo `schema.sql`.

## Como funciona

**Login**
1. O app abre `GET /v1/auth/steam/start?port=<porta local>&state=<aleatório>` no navegador.
2. O servidor manda para a Steam com retorno em `/v1/auth/steam/callback` e confere a resposta com a própria Steam.
3. Cria ou acha o usuário pelo SteamID e devolve para `http://127.0.0.1:<porta>/?code=…&state=…`.
4. O app troca o código (uso único, 2 minutos, preso ao `state`) por um token em `POST /v1/auth/exchange`. No banco, o token fica só como hash SHA-256.

**Rotas com token** (`Authorization: Bearer`)

| Método | Caminho | O quê |
|---|---|---|
| GET / PATCH / DELETE | `/v1/me` | Conta, nome e escolhas de privacidade; DELETE apaga tudo na hora |
| POST | `/v1/auth/logout` | Encerra só esta sessão |
| POST | `/v1/me/activities` | Até 200 eventos por vez; reenviar o mesmo `id` atualiza |
| POST | `/v1/me/activities/delete` | Remove eventos pelo `id` |
| PUT / DELETE | `/v1/me/now-playing` | Jogando agora (some 15 min sem sinal) |
| PUT | `/v1/me/summary` | Resumo do perfil (totais e mais jogados) |
| POST | `/v1/friends/invite` | Código de 8 caracteres, vale 7 dias |
| POST | `/v1/friends/accept` | Vira amigo de quem gerou o código |
| GET | `/v1/friends` | Amigos, com quem está jogando agora |
| DELETE | `/v1/friends/:id` | Desfaz a amizade |
| GET | `/v1/feed?before=&limit=` | Feed dos amigos, do mais novo para o mais antigo |
| GET | `/v1/users/:id` | Perfil de um amigo (só amigos) |
| PUT / DELETE | `/v1/me/showcase` | Vitrine (o JSON do perfil web) |
| PUT / DELETE | `/v1/me/media/:kind` | Avatar, fundo ou arte (JPEG/PNG/WebP em base64, até ~1,1 MB); devolve o endereço público |
| POST | `/v1/users/:id/view` | Link de 30 min para a vitrine de um amigo (`/v1/view/<token>`, página do perfil web com o JSON embutido) |

Capas e avatares só passam se forem de CDNs conhecidos (Steam, IGDB, SteamGridDB). Limite de 120 pedidos por minuto por endereço.
