# Divisão do trabalho depois da 3.0 (Claude e Antigravity)

Combinado em 15/11/2026 com Lazuli Fool, a partir da consultoria de segurança, custo e produto. Cada ferramenta tem a **sua faixa de arquivos**. Assim as duas podem trabalhar no mesmo período sem mexer nos mesmos arquivos (regra 2.3 do `docs/handoff-3.0.md`).

Leia antes: `CLAUDE.md`, `docs/handoff-3.0.md` (as regras da seção 2 valem para tudo aqui) e `ROADMAP.md`.

---

## 1. Faixas de arquivos

| Quem | Dono destes arquivos | Não toca |
|---|---|---|
| **Claude** | `server/**`, `src/main/services/social/**`, `src/main/ipc/social.ts`, `src/renderer/src/components/friends/**`, `FriendsPage.tsx`, `FriendProfilePage.tsx`, `src/renderer/src/stores/useReactionsStore.ts` e `useGroupListsStore.ts`, `.github/**`, `docs/privacidade.md`, e os arquivos de versão (`package.json` `version`, `CHANGELOG.md`, `README.md`, `docs/guia-de-teste.md`) | o que é do Antigravity |
| **Antigravity** | o resto de `src/renderer/src/**` (componentes, hooks, utils, styles, demais stores), `src/main/services/achievements/**`, `src/main/services/profile/**`, `src/main/services/tracker/**` | `server/**`, `src/main/services/social/**`, arquivos de versão |
| **Compartilhados** (um de cada vez) | `src/shared/constants/ipc-channels.ts`, `src/shared/types/ipc.ts`, `src/preload/index.ts`, `src/shared/types/game.ts`, `src/shared/utils/library-sync.ts`, `src/main/database/**`, `ARCHITECTURE.md`, `ROADMAP.md` | veja a regra abaixo |

**Arquivos compartilhados:** durante as tarefas desta lista, o IPC novo é do Antigravity, porque as tarefas dele são as que precisam de canal novo. A faixa do Claude não cria IPC até a tarefa C7 (seção 3). Antes de editar `game.ts`, `library-sync.ts` ou `database/`, combine com a Lazuli. Mudar o formato do banco ou da sincronização exige teste em `tests/`.

**Git no mesmo diretório:**
- Cada um faz `git add` só dos arquivos da sua faixa (nunca `git add -A` ou `git add .`) e commita em pedaços pequenos.
- Antes de começar uma tarefa, `git log --oneline -10` para ver o que o outro fez.
- Commits sem linha `Co-Authored-By`.
- Push, deploy e Release só com o "pode" da Lazuli, a cada vez.
- O CHANGELOG fica com quem fecha a versão: o Antigravity anota as novidades dele na seção 4 deste arquivo, em linguagem de jogador, e a entrada é passada para o CHANGELOG no lançamento.

---

## 2. Tarefas do Antigravity (a alma do app, tudo local, R$0)

Nenhuma destas tarefas faz pedido novo ao servidor. Sempre com o foco visível de controle (`focus-visible:ring-2 focus-visible:ring-indigo-400`) e respeitando `prefers-reduced-motion`.

- **G1. Chave e volume do som de navegação.** ✅ `utils/navigationAudio.ts` já tem `setEnabled`, mas nada o chama. Faça a chave e o volume em `AppBehaviorSettings.tsx`, guardados nas configurações. É pequena e vem primeiro, porque as cerimônias dependem dela.
- **G2. Cerimônias.** ✅ Conquista nova, "Zerado" e "100%" ganham um momento próprio, com a capa do jogo, brilho azul (cores do `@theme` de `styles/index.css`), som curto e vibração do controle (`gamepad.vibrationActuator`). Sem nada piscando forte. Precisa de chave própria em Comportamento e de modo calmo com movimento reduzido.
  - Evento novo do main: em `services/achievements/` quando uma conquista é desbloqueada; para Zerado, quando o status do Diário muda.
  - Componente em `components/shell/`.
  - Não pode aparecer durante o jogo em tela cheia: guardar e mostrar quando o jogo fechar.
- **G3. Controle completo, parte 1.** ✅
  - Botões desenhados conforme o controle (Xbox, PlayStation, Switch pelo `gamepad.id`) em `GamepadGuide.tsx` e na faixa de botões.
  - Botão View/Select abre o menu do jogo focado (hoje o `GameContextMenu` só abre com o botão direito do mouse).
  - Analógico direito rola a página.
  - Arquivos: `hooks/useGamepad.ts`, `utils/spatialNav.ts`, `utils/gameActions.ts`.
- **G4. "Neste dia".** ✅ Na tela inicial (`LibraryHome.tsx`), lembranças como "há 2 anos você zerou X" ou "sua primeira sessão de Y foi hoje", com captura e trecho da resenha quando houver. Some se não houver nada. Dados de `services/profile/activity.service.ts` e das sessões. Só dados locais.
- **G5. Controle completo, parte 2: teclado na tela** ✅ dentro do layout único, para escrever resenha e busca pelo controle. **Não é Big Picture**: nada de modo tela cheia separado.
- **G6. Retrospectiva como história.** ✅ `YearReviewModal.tsx` e `services/profile/year-review.service.ts` viram telas em sequência, navegáveis pelo controle, terminando numa imagem gerada no PC (canvas) para salvar. A imagem não sobe para servidor nenhum.
- **G7. Limpar resíduos da Steam.** ✅ Tokens `--color-steam-*` e o verde `steam-play` em `styles/index.css`. O botão JOGAR passa a usar o azul vivo do tema. Confira o visual em captura antes de dizer que ficou bom.

**Depois, com a Lazuli:** o Diário por sessão ("Como foi?" ao fechar o jogo). Mexe em `game.ts`, `library-sync.ts` e no tamanho da sincronização: só o texto e o humor sobem, a captura fica no PC.

---

## 3. Tarefas do Claude (segurança, servidor e custo zero)

- **C1. Correção de segurança no servidor (urgente).** ✅ Feita e publicada no Worker em 15/11/2026 (`005c390`). Só do servidor; a VPS não roda o servidor social. Sessões abertas mantidas, por decisão da Lazuli.
  - Login pela Steam recusa parâmetro repetido (`verifySteam` em `server/social/src/index.js`).
  - Link da vitrine só vale na vitrine de quem o gerou.
  - Testes de abuso no mesmo commit.
  - Depois, com o "pode": deploy no Worker **e** na VPS e encerrar as sessões abertas.
- **C2. CI no GitHub Actions:** ✅ `d737b7c`. Typecheck, `npm test`, build, `check:package` e os testes dos dois servidores em cada push na main.
- **C3. Consultas mais leves:** ✅ `b002c4f`, publicada no Worker em 15/11/2026.
  - `/v1/me/poll` único (amigos, chamadas e avisos);
  - chamadas a cada 30 s sem amigo online;
  - última atividade gravada a cada 10 min;
  - resumo só quando mudar.
- **C4. Convivência:** ✅ `9000877`, publicada no Worker em 15/11/2026. O texto novo do convite na tela de Amigos só aparece na próxima versão do app.
  - limite de curtidas por conta, com avisos agrupados e título montado pelo servidor;
  - convite de uso único;
  - apagar a conta limpa tudo;
  - imagens da vitrine só de domínios conhecidos.
- **C5. A tela da call não toma o foco** e não aceita por Enter sem querer. Continua fora do CHANGELOG (regra 2.4). ✅ Com jogo aberto aparece sem foco; "tô indo" só segurando 0,8 s (mouse, Enter ou A), e nada responde no primeiro 1,2 s.
- **C6. Backup do D1 cifrado** (script pronto; a chave e o token ficam com a Lazuli). ✅ `npm run backup` em `server/social` (pelo login do wrangler, senha só com a Lazuli, guarda as 8 mais novas); `npm run restore` confere, abre num SQLite ou devolve ao D1. Como usar: `server/social/README.md`.
- **C7. "Dar um tempo" com amigo** (silenciar com prazo, ou bloquear). Precisa de IPC novo: só depois que o G2 e o G4 estiverem commitados. ✅ Botão *Dar um tempo* no perfil do amigo (silenciar 1 dia, 1 semana, 1 mês ou até desfazer; bloquear; desfazer amizade) e caixa *Bloqueados* em Amigos. **Antes de soltar a versão:** aplicar o `schema.sql` no D1 e publicar o Worker (tabelas `friend_mutes` e `blocks`).

---

## 4. Novidades para o CHANGELOG (o Antigravity anota aqui)

<!-- Uma linha por novidade, na voz de quem joga. Ex.: "- Conquistas novas ganham uma comemoração (dá para desligar em Comportamento)." -->
- **Som de navegação:** dá para ligar, desligar e ajustar o volume dos cliques de navegação em *Configurações → Comportamento*.
- **Cerimônias:** conquistas novas, jogos zerados e marcas de 100% agora aparecem numa comemoração com capa, brilho azul, som e vibração leve do controle (ou em modo calmo se o sistema usar movimento reduzido). Quando um jogo está em tela cheia, ela espera você fechar para aparecer; também dá para desligar em *Configurações → Comportamento*.
- **Controle completo (parte 1):** os símbolos da barra de ajuda e da Ajuda mudam conforme o controle conectado (Xbox, PlayStation ou Switch), o botão View / Select abre o menu de opções do jogo focado e o analógico direito rola a página.
- **Neste dia:** na tela inicial da biblioteca, o Lazulium passa a mostrar lembranças do mesmo dia em anos anteriores (quando você zerou um jogo, fez 100% ou jogou pela primeira vez), com captura de tela e trecho da sua resenha quando houver — tudo só com os dados do seu PC, e some quando não há nada para mostrar.
- **Teclado na tela para controle:** ao apertar Buscar ou confirmar em um campo de texto ou resenha com o controle, um teclado com acentos em português abre na parte de baixo da mesma janela para digitar sem precisar levantar do sofá.
- **Retrospectiva em etapas:** a retrospectiva do ano no Perfil agora abre como uma história passo a passo, navegável pelo controle (`LB`/`RB` ou equivalente), e termina com um cartão resumido desenhado no próprio PC para você salvar como imagem sem enviar nada para fora.
- **Dar um tempo:** no perfil de um amigo, silencie a pessoa por 1 dia, 1 semana, 1 mês ou até desfazer (o que ela faz some do seu feed e os avisos dela param, sem ela saber), bloqueie ou desfaça a amizade. Quem você bloqueou fica em *Amigos → Bloqueados*.
- **Visual do Lazulium unificado:** o botão JOGAR agora usa o azul vivo do tema do app, deixando para trás o antigo verde herdado.
