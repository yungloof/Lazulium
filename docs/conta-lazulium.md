# Conta Lazulium (2.0): amigos, feed e perfil gamer

Plano da camada social. **Feito na 2.0.0** (fases 1 a 3): servidor em `server/social`, aba Amigos no app. Falta publicar o servidor (veja `server/social/README.md`) e as fases 4 e 5.

## A ideia

Você entra com a Steam, e seus amigos veem o que você jogou, zerou, as conquistas e as notas que deu, em **qualquer loja**. O login da Steam serve só para dizer quem você é. Quem manda os dados é o Lazulium do seu PC.

## O que já existe (1.1)

- **Linha do tempo local** (`src/main/services/profile/activity.service.ts`, tipos em `src/shared/types/activity.ts`): jogou (sessões agrupadas por dia), começou, zerou, 100%, largou, deu nota, escreveu resenha, conquistas do dia e todas as conquistas. Aparece no Perfil, na seção Atividade. É exatamente o que vai para o feed.
- **Mudanças do Diário gravadas com data** (`activityLog` no banco), porque status, nota e resenha não tinham data própria.
- **Tela de Contas separada em "você" e "conexões"**, com o cartão "Em breve" no lugar onde a conta Lazulium vai entrar.
- **Login pela Steam (OpenID)** no app, hoje usado só para ler a sua conta. Na 2.0 o mesmo fluxo passa a ser verificado pelo servidor.

## Identidade

- **Entrar com a Steam (OpenID 2.0)**, verificado **no servidor**. O app não pode simplesmente dizer "sou o SteamID tal", porque qualquer um falsificaria.
  1. O app abre `https://<servidor>/v1/auth/steam/start?port=<porta local>` no navegador.
  2. O servidor manda para a Steam com `return_to` apontando para ele mesmo.
  3. Na volta, o servidor confere com a Steam (`openid.mode=check_authentication`), cria ou acha o usuário pelo SteamID e gera um **token de sessão** (aleatório, 256 bits; no banco fica só o hash).
  4. O servidor redireciona para `http://127.0.0.1:<porta>/` com um código de uso único, e o app troca o código pelo token. O token nunca aparece em URL de site.
  5. O token fica cifrado com `safeStorage`, como as outras credenciais.
- Mais tarde dá para ligar **Discord** ou **Google** à mesma conta, para amigos sem Steam.
- Ninguém cria senha, e o servidor não guarda e-mail.

## Onde roda

| Opção | Prós | Contras |
|---|---|---|
| **Cloudflare Worker + D1** (recomendado) | Já usamos o Worker. D1 é SQLite gerenciado, de graça até 5 GB e 5 milhões de leituras por dia. HTTPS, cache e limite de pedidos prontos. Não tem servidor para manter. | Limite de CPU por pedido (o feed precisa de consultas enxutas). |
| VPS Oracle (`147-15-123-238.sslip.io`) | Controle total, Node + SQLite/Postgres, já tem Caddy e PM2. | Backup, atualização do sistema e quedas ficam por nossa conta. Uma máquina só. |

Recomendação: **Worker + D1** para a API social e a VPS como espelho e para os downloads (como hoje). O código da API fica em `server/social/`, separado do `igdb-proxy`.

## Dados no servidor (D1)

```sql
users        (id TEXT PK, steam_id TEXT UNIQUE, name TEXT, avatar_url TEXT, created_at, last_seen_at)
sessions     (token_hash TEXT PK, user_id, created_at, expires_at)
friendships  (user_a, user_b, created_at, PRIMARY KEY (user_a, user_b))          -- sempre user_a < user_b
friend_codes (code TEXT PK, user_id, expires_at)                               -- convite por link/código
activities   (id TEXT PK, user_id, kind, game_key, game_title, cover_url, at, rating, count, seconds)
reviews      (user_id, game_key, rating, text, updated_at, PRIMARY KEY (user_id, game_key))
now_playing  (user_id PK, game_key, game_title, since)                          -- some sozinho após 10 min sem sinal
settings     (user_id PK, share_playtime, share_achievements, share_reviews, share_now_playing, visibility)
```

- `game_key` identifica o jogo entre pessoas diferentes: `steam:<appid>`, senão `igdb:<id>` (o Worker já resolve pelo nome), senão o título normalizado. Assim o mesmo jogo da Epic e da Steam se encontra na comparação.
- **Nada de caminhos do PC, nomes de pasta, e-mail ou chaves.** Só o que aparece no feed.

## API (resumo)

| Método | Caminho | O quê |
|---|---|---|
| GET | `/v1/auth/steam/start` e `/callback` | Login (acima) |
| POST | `/v1/auth/exchange` | Código de uso único → token |
| DELETE | `/v1/me` | Apaga a conta e tudo dela, na hora |
| GET/PUT | `/v1/me/settings` | O que compartilhar |
| POST | `/v1/me/activities` | O app manda eventos novos (em lotes, idempotente pelo `id`) |
| PUT | `/v1/me/now-playing` | "Jogando agora" (o tracker manda ao abrir e a cada 5 min) |
| POST | `/v1/friends/code` / `/v1/friends/accept` | Convite por código ou link |
| GET | `/v1/friends` | Lista, com quem está jogando agora |
| GET | `/v1/feed?before=` | Feed dos amigos, paginado |
| GET | `/v1/users/:id` | Perfil de um amigo (vitrine, horas por loja, reviews) |
| GET | `/v1/compare/:id` | Jogos em comum, horas e conquistas lado a lado |

Limite de pedidos por usuário no Worker (`RATE_LIMITER`), como no `/v1/prices`.

## No app

- **Aba "Amigos"** na barra do topo: feed, "jogando agora" e pedidos de amizade.
- **Perfil de amigo:** a mesma vitrine do seu perfil, só leitura, com "comparar".
- **Página do jogo:** "3 amigos jogaram" com as notas deles.
- **Contas:** o cartão "Em breve" vira "Conta Lazulium", com sair, apagar a conta e o que compartilhar.
- O envio sai do `activity.service`: guarda o último evento enviado e manda os novos em segundo plano. Sem internet, manda depois.
- Sem conta Lazulium, o app continua igual a hoje. A conta é opcional.

## Privacidade (muda a promessa)

Hoje é "nada sai do PC". Com a conta passa a ser **"só sai o que você escolher, e só para seus amigos"**.

- Tudo desligado até a pessoa entrar. No login, uma tela mostra o que vai ser compartilhado, com uma chave para cada coisa.
- Visível só para amigos, a menos que a pessoa marque o perfil como público.
- Apagar a conta remove tudo do servidor na hora (`DELETE /v1/me`).
- `docs/privacidade.md`, a tabela de serviços do `ARCHITECTURE.md` e a página `/privacidade` do Worker são atualizados **antes** de publicar.

## Fases

1. **Servidor:** login pela Steam, `users`, `sessions` e `DELETE /v1/me`, com testes no mesmo estilo do `igdb-proxy`.
2. **Amigos:** código e link de convite, lista de amigos, "jogando agora".
3. **Feed:** envio da linha do tempo, feed paginado, perfil de amigo.
4. **Comparar e reviews:** jogos em comum, notas dos amigos na página do jogo.
5. **Extras:** listas compartilhadas e sincronizar o Diário entre PCs.

## Decidido

- Login pela Steam, verificado no servidor.
- Cloudflare Worker + D1 para a API social, com a VPS de apoio.
- Conta opcional; o app continua funcionando sem ela.
- Não fazer: chat próprio, loja, IA local.

## Em aberto

- Nome público: o da Steam ou um nome escolhido no Lazulium (sugestão: o do perfil do Lazulium, que já existe).
- Amigos da Steam: sugerir automaticamente quem já é amigo lá? Precisa da lista de amigos pública na Steam.
- Notificações no Windows quando um amigo começa a jogar (opcional, desligado por padrão).
