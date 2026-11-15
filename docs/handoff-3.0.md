# Passagem da 3.0

Para quem pegar o resto da 3.0 (Antigravity, Claude ou gente). Leia inteiro antes de mexer: as regras da seção 2 não estão no código e já foram combinadas com a dona do projeto, Lazuli Fool.

Situação em 14/11/2026: branch `feat/phase-5-achievements`, última versão lançada **2.10.0**, nada da 3.0 publicado no GitHub ainda. O servidor `server/social` em produção já tem tudo o que está pronto abaixo.

---

## 1. Onde estamos

**Pronto (no código e no servidor de produção):**

- Status como no Discord (Disponível, Ausente, Não perturbar, Invisível): `presence.service.ts`, `StatusMenu.tsx`.
- Chamar amigo pra call: `calls.service.ts`, `call-overlay.ts`, `CallButton.tsx`. **Veja a regra 2.4.**
- Amigos na página do jogo e conquistas lado a lado: biblioteca resumida em `services/social/library-rows.ts` e `pushLibrary` no `social.service.ts`; cartão Amigos em `components/friends/GameFriends.tsx`; aba Comparar em `FriendCompare.tsx`.
- Curtir e comentar resenhas e listas, com avisos: `services/social/reactions.service.ts`, `components/friends/Reactions.tsx` e `Notifications.tsx`, `stores/useReactionsStore.ts`, `src/shared/utils/reactions.ts` e `notifications.ts`; na vitrine web, o bloco "Curtir e comentar" de `web/profile/index.html`.

Detalhes de cada um estão em `ARCHITECTURE.md` (seção do social) e as rotas em `docs/conta-lazulium.md`.

**Falta para fechar a 3.0** (seção 3): listas em grupo, Diário/listas/categorias/favoritos entre PCs, perfil completo na web, Electron 46 e o lançamento.

---

## 2. Regras que não estão no código

1. **Nunca abrir o app visível.** Teste só em modo silencioso, com uma cópia dos dados, inspecionando por CDP (seção 4). Nada de rodar instalador, abrir jogo, criar atalho ou escrever em `%APPDATA%\Lazulium`. É o PC de uso pessoal da dona.
2. **Git:** pode commitar sozinho (`feat(...)`, `fix(...)`), **sem linha `Co-Authored-By`** (o histórico tem só Lazuli Fool como autora). **Push** (`git push origin HEAD:main`), **deploy** (`wrangler d1 execute ... --remote`, `wrangler deploy`, VPS) e **Release** só com o "pode" dela, a cada vez. `web/profile/lazulium-perfil.json` tem dados pessoais e nunca vai para o git.
3. **Antes de assumir o estado, confira os commits recentes:** a dona alterna entre Claude e Antigravity, e um pode ter mexido depois do outro. Nunca rodem os dois ao mesmo tempo nos mesmos arquivos.
4. **O botão de chamar amigo pra call (e a tela que abre do outro lado) fica fora do CHANGELOG, das notas de versão, do README, da tela de novidades e de qualquer texto de divulgação.** É de propósito. O código e a política de privacidade continuam como estão.
5. **Produto (não reabrir):**
   - não pedir chave de API ao jogador: o login é pela conta, e chave manual só em Configurações → Avançado;
   - Big Picture saiu e não volta;
   - conquistas têm o mesmo destaque em todas as plataformas;
   - backup automático de saves só com consentimento;
   - o login do Google (Drive, `drive.file`) já está em produção desde 10/11/2026.
6. **Sem scraper do Your Gamer Profile nem do Backloggd** (os termos proíbem). Importar só pelo arquivo de exportação que a própria pessoa baixou.
7. **Visual:** azul-noite com azul vivo e cantos arredondados. Não voltar ao cinza-azulado da Steam nem a cantos retos; os valores ficam no `@theme` de `src/renderer/src/styles/index.css`. A logo (`resources/logo.png`) é desenho da dona e não se altera. Confira o visual em captura antes de dizer que ficou bom.
8. **Textos** em português do Brasil, na linguagem de quem joga (sem jargão técnico na interface e no CHANGELOG). A dona é Lazuli Fool, não-binária: use esse nome e linguagem neutra.
9. **Dado novo saindo do PC** (servidor próprio ou terceiro) muda `docs/privacidade.md` (com a data no topo) e a tabela de serviços do `ARCHITECTURE.md` **antes** de publicar.
10. **IPC novo** segue os 5 passos do `CLAUDE.md` (canal → tipos → handler → preload → renderer). Mudou banco, mescla do scanner ou regra de biblioteca: teste em `tests/`.

---

## 3. O que falta

### 3.1 Listas em grupo (mais de uma pessoa monta a mesma lista)

Hoje as listas são só locais (`gameLists` no banco, `lists.service.ts`) e vão para os amigos dentro da vitrine. Lista em grupo precisa morar no servidor:

- Tabelas novas em `server/social/schema.sql` (sempre `CREATE TABLE IF NOT EXISTS`), por exemplo uma lista com dono e membros e os jogos com quem pôs.
- **Os jogos vão pelo nome e capa pública, não pelo id local**: o id de um jogo muda de PC para PC (jogo avulso, emulador). Use o mesmo `titleKey` `t:<nome>` da biblioteca resumida (`src/shared/utils/title-key.ts`) e, para mostrar se você tem o jogo, cruze como `compareWithFriend` faz.
- **Quem entra:** só amigos do dono, convidados por ele. O servidor confere em cada pedido, como `canSee` nas curtidas.
- **Interface:** na aba Listas, com um selo de quem está na lista. Curtir e comentar já funciona para `kind: 'list'`; dá para reaproveitar.
- **Docs:** privacidade (o que vai: nome da lista, jogos, quem pôs) e testes do servidor em `server/social/src/index.test.mjs` (`npm test` dentro de `server/social`).

### 3.2 Diário, listas, categorias e favoritos entre PCs

É o item mais arriscado: um erro apaga o Diário de alguém. Regras:

- **Consentimento próprio:** uma chave separada, desligada até a pessoa ligar, explicando o que sobe. Atualize `docs/privacidade.md` antes de escrever o código de envio.
- **Ninguém perde nada num conflito:** cada item (registro do Diário de um jogo, lista, categoria) leva um `updatedAt`, e vale o mais novo **por item**, nunca "o PC inteiro ganha". Apagar vira uma marca de apagado com data, não uma remoção, para o outro PC não ressuscitar o item.
- **Casar os jogos entre PCs:** o id local (`steam-620`, `epic-...`) bate entre PCs só para jogos de loja; jogo avulso, emulador e registro manual do Diário precisam de outra chave (`steamKey` ou `titleKey`, como em `library-rows.ts`).
- **Teste antes de tudo:** casos em `tests/` para mesclar dois bancos (mesmo item editado nos dois, apagado num e editado no outro, jogo que só existe num PC). Depois, teste com duas cópias de dados apontando para o mesmo servidor local (seção 4).
- O banco tem backup de 14 dias e recuperação (`src/main/database/`). Rode a mescla só depois de um backup.

### 3.3 Perfil completo na web

A vitrine (`web/profile/index.html`, montada pelo `profile.service.ts`) já mostra visão geral, Avaliações (notas e resenhas) e Listas, e é a mesma página que os amigos abrem pelo app e a que *Perfil → Publicar na web* gera. Falta o **Diário** (o que a pessoa jogou, começou e terminou por mês, como na aba Diário do app, `JournalPage.tsx`):

- uma aba Diário na página, com os dados no JSON do perfil (`src/shared/types/profile.ts`), respeitando a chave *Notas e resenhas* e o que estiver oculto;
- limite de tamanho, como `MAX_PROFILE_LISTS` em `profile-lists.ts`, porque a vitrine vai para o servidor (`/v1/me/showcase`);
- curtir e comentar continua valendo (o bloco `reactBar` da página);
- teste com `scripts/social-test` (a vitrine de um amigo abre em `http://127.0.0.1:3199/v1/view/<token>`) e confira se o JSON publicado não leva nada além do que a privacidade descreve.

### 3.4 Electron 46

Em 14/11/2026 o 46 ainda é alpha (`npm view electron dist-tags`: latest 45.3.2, alpha 46.0.0-alpha.10). **Esperar a versão estável.** O `safeStorage` assíncrono já foi feito. Quando sair: subir `electron` no `package.json`, ler as quebras da versão, `npm run typecheck`, `npm test`, build de teste e passada em modo silencioso.

### 3.5 Lançamento da 3.0

- `version` 3.0.0 no `package.json`, seção nova no `CHANGELOG.md` (em linguagem de jogador, **sem o botão de call**, regra 2.4) e os nomes dos instaladores no `README.md` e em `docs/guia-de-teste.md`.
- `npm run build:win` roda os testes e o `scripts/check-package.mjs` antes do electron-builder.
- Push, Release e qualquer deploy só com o "pode" da dona (regra 2.2).
- O instalador assinado e o GitHub Pages dependem de passos da dona (`docs/publicar-1.0.md`).

---

## 4. Como testar sem tocar no app de verdade

Os scripts ficam em `scripts/social-test/`. Use uma pasta temporária **fora do projeto** para o banco e os dados (abaixo, `$T`).

```bash
# 1. Build de teste (caminho absoluto, senão o renderer vai parar dentro de src/)
npx electron-vite build --outDir "F:\\projetos\\SteamGridForge\\out-test"

# 2. Servidor social local com dois amigos de teste (A = você, B = amiga; C entra no passo 3)
node scripts/social-test/seed.mjs "$T/social.db"
cd server/social && SOCIAL_DB="$T/social.db" PORT=3199 node server.mjs   # deixe rodando em outro terminal

# 3. (opcional) biblioteca e "jogando agora" falsos de B e C
node scripts/social-test/lib-friends.mjs "$T/social.db"

# 4. Cópia dos dados do app (só lê %APPDATA%\Lazulium; zera chaves e tokens; entra como A)
node scripts/social-test/copy-ud.mjs "$T/ud"

# 5. App invisível apontando para o servidor local
LAZULIUM_SILENT=1 LAZULIUM_USER_DATA="$T/ud" LAZULIUM_SOCIAL_URL=http://127.0.0.1:3199 LAZULIUM_SOCIAL_POLL_MS=5000 \
  npx electron out-test/main/index.js --remote-debugging-port=9361
```

- **Inspecionar:** `node scripts/social-test/cdp.mjs 9361 meu-script.js captura.png` roda o arquivo como função `async` na janela e salva a captura. A janela de teste não recebe foco de verdade: para testar `onBlur`, dispare `focusout` à mão.
- **Agir como o amigo:** `MSYS_NO_PATHCONV=1 node scripts/social-test/as.mjs b POST /v1/social/like '{"owner":"11111111-1111-4111-8111-111111111111", ...}'`.
- **Vitrine de A vista por B:** `as.mjs b POST /v1/users/11111111-1111-4111-8111-111111111111/view` devolve o link; abra-o num navegador.
- **Ao terminar:**
  - feche os `electron.exe` cujo comando tem `out-test` e o `node server.mjs`;
  - apague `out-test` e a pasta `$T`;
  - nunca commite `out-test`.

Antes de tudo isso, `npm run typecheck` e `npm test` (vitest, sem Electron). O servidor tem os testes dele: `cd server/social && npm test`.
