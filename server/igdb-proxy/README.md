# Servidor do IGDB (tempo para zerar)

O IGDB exige uma credencial da Twitch e [não aceita chamada direta de aplicativo cliente](https://api-docs.igdb.com/#cors-proxy). Se ela ficasse no Lazulium, qualquer um poderia extraí-la do instalador. Por isso este servidor guarda a credencial e responde só uma pergunta: quanto tempo leva este jogo.

Quem usa o Lazulium não cria conta nem digita chave. A publicação abaixo é feita uma vez só, pelo dono do projeto.

## Publicar

Precisa de contas gratuitas na Twitch e na Cloudflare.

### 1. Credencial da Twitch

1. Ative a autenticação em dois fatores na conta da Twitch (o IGDB exige).
2. Em <https://dev.twitch.tv/console/apps>, clique em **Register Your Application**.
3. Preencha: nome `Lazulium`, OAuth Redirect URL `http://localhost`, categoria **Application Integration**, Client Type **Confidential**.
4. Abra o aplicativo criado, anote o **Client ID** e gere o segredo em **New Secret**.

Não mande o Client ID nem o segredo para ninguém. Eles só são digitados no passo 3.

### 2. Login e cache na Cloudflare

Nesta pasta (`server/igdb-proxy`):

```bash
npx wrangler@latest login
```

```bash
npx wrangler@latest kv namespace create IGDB_CACHE
```

Copie o `id` mostrado para o lugar de `COLE_AQUI_O_ID_DO_KV` no `wrangler.toml`. Esse id não é segredo.

### 3. Guardar a credencial

Cada comando pede o valor. Cole quando pedir:

```bash
npx wrangler@latest secret put TWITCH_CLIENT_ID
```

```bash
npx wrangler@latest secret put TWITCH_CLIENT_SECRET
```

### 4. Publicar

```bash
npx wrangler@latest deploy
```

No fim aparece uma URL como `https://lazulium-igdb.SEU-USUARIO.workers.dev`.

### 5. Conferir

```bash
node smoke.mjs https://lazulium-igdb.SEU-USUARIO.workers.dev
```

Depois, coloque a URL em `IGDB_PROXY_URL`, em `src/main/services/metadata/play-length.service.ts`, e gere o instalador. A URL não é segredo.

## Como funciona

`GET /v1/time-to-beat?steamAppId=620&title=Portal%202`

- Com `steamAppId`, procura pelo vínculo Steam do IGDB. Se o jogo não tiver vínculo, tenta pelo `title`.
- Com `title`, só aceita nome igual, ignorando maiúsculas e pontuação, para não trazer o tempo de outro jogo. Entre versões de mesmo nome, vence a que tem mais envios.
- Resposta: `{ found, gameId, name, hastily, normally, completely, count }`, com tempos em segundos. Sem dados: `{ "found": false }`.
- Resultados ficam em cache por 30 dias, e "não encontrado" por 7. Falhas temporárias não entram no cache e respondem 503.

`GET /v1/artwork?title=Hollow%20Knight`

- Capa (`t_cover_big_2x`) e fundo (`t_1080p`: arte oficial, ou uma captura se não houver) do IGDB, para quem não conectou o SteamGridDB.
- Mesmo critério do tempo para zerar: só nome igual. Resposta: `{ found, name, cover, hero }` (`hero` pode ser `null`), ou `{ "found": false }`.
- Fica no mesmo cache de 30 dias (7 para "não encontrado").

`GET /v1/prices?steamAppIds=420,620` (precisa do segredo `GGDEALS_API_KEY`)

- Repassa só `url`, `currency` e os quatro preços do GG.deals (atual e menor histórico, lojas oficiais e revendedores de chaves), em centavos. Jogo que o GG.deals não conhece vem como `null`.
- O GG.deals manda os preços como texto decimal (`"91.99"`); texto em outro formato vira `null` em vez de um preço errado.
- A chave tem limite por jogo consultado (100 por minuto, 1.000 por hora): cada jogo fica 6 horas no cache da borda da Cloudflare e só os que faltam são consultados. Cota esgotada responde 429, ou devolve só a parte em cache com `"incomplete": true`.
- O GG.deals pede crédito com link para o site em toda tela que mostra os preços.

## Limites

- **IGDB:** 4 requisições por segundo e até 8 abertas. Com o cache, isso só pesa em jogos ainda não consultados.
- **Cloudflare gratuito:** 100 mil requisições e 100 mil leituras de KV por dia, e 1.000 escritas de KV por dia. Se a cota de escrita acabar, as respostas continuam, só que sem cache.
- **Uso comercial:** a API é gratuita para uso não comercial. Se o Lazulium passar a ganhar dinheiro, é preciso pedir a parceria em `partner@igdb.com`, que exige citar o IGDB de forma visível.

## Testes

```bash
npm test
```

Os testes rodam o código real do Worker com Twitch e IGDB falsos. Só o `smoke.mjs` confere o serviço de verdade.
