# Passagem da 3.0

Para quem pegar o resto da 3.0 (Antigravity, Claude ou gente). Leia inteiro antes de mexer: as regras da seção 2 não estão no código e já foram combinadas com a dona do projeto, Lazuli Fool.

Situação em 14/11/2026: branch `feat/phase-5-achievements`, última versão lançada **2.10.0**. O código da 3.0 já está na `main` do GitHub (até o commit `610ae95`), mas **ainda sem Release**: o `package.json` continua em 2.10.0. O servidor `server/social` em produção já tem tudo o que está pronto abaixo (tabelas no D1 e Worker publicados).

---

## 1. Onde estamos

**Pronto (no código e no servidor de produção):**

- Status como no Discord (Disponível, Ausente, Não perturbar, Invisível): `presence.service.ts`, `StatusMenu.tsx`.
- Chamar amigo pra call: `calls.service.ts`, `call-overlay.ts`, `CallButton.tsx`. **Veja a regra 2.4.**
- Amigos na página do jogo e conquistas lado a lado: biblioteca resumida em `services/social/library-rows.ts` e `pushLibrary` no `social.service.ts`; cartão Amigos em `components/friends/GameFriends.tsx`; aba Comparar em `FriendCompare.tsx`.
- Curtir e comentar resenhas e listas, com avisos: `services/social/reactions.service.ts`, `components/friends/Reactions.tsx` e `Notifications.tsx`, `stores/useReactionsStore.ts`, `src/shared/utils/reactions.ts` e `notifications.ts`; na vitrine web, o bloco "Curtir e comentar" de `web/profile/index.html`.
- Listas em grupo (o dono convida amigos e todos montam a mesma lista): `services/social/group-lists.service.ts`, `stores/useGroupListsStore.ts`, `components/friends/GroupListDetail.tsx`, na aba Listas (`ListsPage.tsx`); no servidor, as tabelas `group_lists*`. Os jogos vão pelo `titleKey`, não pelo id local.
- Diário, listas, categorias e favoritos entre PCs (chave própria, desligada por padrão, em *Configurações → Contas*): mescla em `src/shared/utils/library-sync.ts`, envio em `services/social/sync.service.ts`, rota `/v1/me/sync` e tabela `user_sync`. Veja a seção 3.1 antes de mexer.
- Aba Diário na vitrine web: `services/profile/profile-journal.ts` monta os dados, `web/profile/index.html` mostra.

Detalhes de cada um estão em `ARCHITECTURE.md` (seção do social) e as rotas em `docs/conta-lazulium.md`.

**Falta para fechar a 3.0** (seção 3): um teste de sincronização com duas cópias, o Electron 46 e o lançamento.

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

### 3.1 Sincronização entre PCs: o que já vale e o que testar

É a parte mais arriscada da 3.0: um erro apaga o Diário de alguém. Regras que o código já segue e que não podem ser quebradas:

- **Consentimento próprio:** a chave fica desligada até a pessoa ligar neste PC, e `docs/privacidade.md` descreve o que sobe.
- **Vale o mais novo por item, nunca "o PC inteiro ganha":** cada registro do Diário (`logUpdatedAt`), favorito (`favoriteUpdatedAt`), lista e categoria tem a sua data. Apagar vira marca de apagado com data (`syncTombstones`), para o outro PC não ressuscitar o item.
- **Registro do Diário de antes da sincronização** (sem data) é juntado com o do outro PC, não descartado; em campo conflitante vale o que tem data.
- **Jogos entre PCs** casam pelo id de loja, `steamKey` ou `titleKey`; o que só existe no outro PC fica guardado em `syncUnresolved` até aparecer.
- **Backup antes de mesclar:** `db.applySyncState` faz uma cópia em `backups/sync/` (guarda 5) e, se ela falhar, desiste sem mudar nada.
- **Tamanho:** o servidor recusa cópia acima de 1,9 MB **em bytes** (uma linha do D1 cabe 2 MB).
- **Limite conhecido, de propósito:** a lista vale inteira (a versão mais nova). Juntar os jogos das duas versões ressuscitaria o jogo tirado num PC; fazer direito exigiria guardar a lista como estava na última sincronização. Só perde algo quem edita a mesma lista nos dois PCs ao mesmo tempo, sem internet.

Mexeu em `library-sync.ts`: acrescente o caso em `tests/shared/library-sync.test.ts`.

**Falta antes do lançamento:** o teste com duas cópias de dados apontando para o mesmo servidor local (seção 4). Faça `copy-ud.mjs` duas vezes (pastas diferentes, as duas entram como A), ligue a sincronização numa, edite o Diário, um favorito, uma lista e uma categoria, ligue na outra e confira que tudo chegou; depois edite o mesmo jogo nas duas e veja que nada some. Duas instâncias ao mesmo tempo precisam de portas de CDP diferentes.

### 3.2 Electron 46

Decidido em 14/11/2026: **a 3.0 sai no Electron 45**, e o **Electron 46 fica para uma 3.0.x** quando sair a versão estável (`npm view electron dist-tags`: latest 45.3.2, alpha 46.0.0-alpha.10). O `safeStorage` assíncrono já foi feito. Quando sair o estável do 46: subir `electron` no `package.json`, ler as quebras da versão, `npm run typecheck`, `npm test`, build de teste e passada em modo silencioso.

### 3.3 Lançamento da 3.0

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
