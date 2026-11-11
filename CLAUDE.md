# 🤖 Lazulium (Steam 2) - Diretrizes de Desenvolvimento e Colaboração (CLAUDE.md)

Este documento define padrões de engenharia, arquitetura e convenções de código para agentes de IA (Claude, Antigravity) e desenvolvedores humanos trabalhando no **Lazulium (Steam 2)**.

---

## 1. Princípios de Engenharia

1. **Modularidade Rigorosa:**
   - O código do backend (`main/services/`) deve ser completamente desacoplado da interface gráfica (`renderer/`).
   - Cada serviço possui responsabilidade única:
     - `services/scanners/`: Apenas descobre e valida executáveis / manifests.
     - `services/tracker/`: Apenas monitora ciclo de vida de processos e calcula tempo.
     - `services/metadata/`: Comunicação com API do SteamGridDB e armazenamento de cache de imagens.
     - `services/achievements/`: Consome Steam Web API e RetroAchievements.
     - `services/profile/`: Perfil do jogador (estatísticas e exportação).
     - `services/accounts/`: Login nas contas (Steam local/OpenID, janelas de login do SteamGridDB/RetroAchievements, Google).
     - `services/social/`: Conta Lazulium (amigos, feed, jogando agora), falando com `server/social`.
     - `services/cloudsync/`: Compacta saves e comunica com Google Drive.
     - `database/` (`src/main/database/db.ts`): Banco de dados JSON (`lazulium_db.json`), gravação atômica, histórico de 14 dias de backups e recuperação contra corrupção.

2. **Tipagem Estrita (Zero `any` desnecessário):**
   - Todos os tipos compartilhados entre o `main` e o `renderer` **devem** residir em `src/shared/types/`.
   - As chamadas IPC devem ser sempre tipadas através da interface `IpcApi` definida em `src/shared/types/ipc.ts`.

3. **Resiliência a Falhas:**
   - Erros no scanner da Epic Games ou em um emulador específico **nunca** devem quebrar o carregamento dos outros jogos. Todo scanner roda isolado em `try/catch` individual e loga avisos úteis.
   - O processo de monitoramento de playtime roda em segundo plano com overhead mínimo (consumo desprezível de CPU/RAM).

4. **Experiência do Usuário (Gamepad-First):**
   - Todos os componentes interativos devem ser acessíveis tanto por clique de mouse quanto por foco espacial de controle (D-Pad / Analógico).
   - Deve haver sempre um anel visual claro de foco (`focus-visible:ring-2 focus-visible:ring-indigo-400`, a cor de destaque do tema) para quando o controle estiver ativo.

---

## 2. Estrutura de Diretórios

```
Lazulium/
├── src/
│   ├── main/                    # Processo Principal do Electron (Node.js)
│   │   ├── index.ts             # Inicialização e ciclo de vida (janela e bandeja em app-shell.ts, log em logger.ts)
│   │   ├── ipc/                 # Handlers IPC por domínio (library, play, achievements...), helpers.ts e events.ts
│   │   ├── services/            # Serviços de negócio (Scanners, Tracker, etc.); HTTP comum em services/metadata/http.ts
│   │   └── database/            # Banco JSON: db.ts, storage.ts (disco, gravação atômica) e normalize.ts (versão do formato)
│   ├── preload/                 # Ponte de segurança (ContextBridge)
│   │   ├── index.ts             # Expõe electronAPI tipada
│   │   └── index.d.ts           # Extensão do objeto global Window
│   ├── renderer/                # Interface React + Vite + Tailwind
│   │   ├── src/
│   │   │   ├── components/      # Telas e componentes; base reutilizável em components/ui/
│   │   │   ├── hooks/           # Hooks (useGamepad, useAppEvents, etc.)
│   │   │   ├── stores/          # Zustand state stores
│   │   │   ├── utils/           # Navegação espacial, formatação, ações de jogo
│   │   │   └── styles/          # Tailwind e CSS global
│   └── shared/                  # Código compartilhado entre Main e Renderer
│       ├── types/               # Tipos TypeScript puros
│       └── constants/           # Enums, canais IPC, configurações padrão
├── resources/                   # Logo do dono (logo.png, não alterar), ícones e imagens do instalador gerados dela
├── scripts/                     # generate-icons.mjs (npm run icons) e check-package.mjs (conferência antes do empacotamento)
├── server/igdb-proxy/           # Cloudflare Worker: tempo para zerar, busca e capas (IGDB) e preços (GG.deals)
├── server/social/               # Cloudflare Worker + D1: conta Lazulium (login pela Steam, amigos, feed)
├── web/profile/                 # Página web estática do perfil
├── docs/                        # Guia de teste, política de privacidade e checklist de publicação
├── ARCHITECTURE.md              # Documentação detalhada da arquitetura
├── ROADMAP.md                   # Fases de desenvolvimento
├── CHANGELOG.md                 # Novidades por versão, em linguagem de jogador
└── package.json                 # Inclui o bloco "build" do electron-builder
```

---

## 3. Padrões de Código

- **Linguagem:** TypeScript (Strict mode ativado).
- **Estilos:** Tailwind CSS com classes utilitárias semânticas.
- **Nomes de Arquivo:**
  - Componentes React: `PascalCase.tsx` (ex: `GameCard.tsx`, `Sidebar.tsx`).
  - Hooks: `camelCase.ts` com prefixo `use` (ex: `useGamepad.ts`).
  - Serviços: `kebab-case.service.ts` (ex: `steam-scanner.service.ts`).
  - Tipos: `kebab-case.ts` (ex: `game.ts`, `ipc.ts`).
- **Gerenciamento de Estado:**
  - Evite passar props excessivas (prop drilling). Use Zustand stores (`useLibraryStore`, `useGamepadStore`, etc.).

---

## 4. Scripts e Comandos Comuns

```bash
# Instalar dependências
npm install

# Iniciar em modo de desenvolvimento (Electron + Vite HMR)
npm run dev

# Fazer checagem de tipos TypeScript
npm run typecheck

# Gerar build de produção (instalador + portátil em dist/; confere o pacote antes do electron-builder)
npm run build:win

# Regenerar ícones e imagens do instalador a partir de resources/logo.png
npm run icons
```

- **Dependências do main:** o processo main só pode usar, em tempo de execução, pacotes de `dependencies` que **não** estão nas exclusões de `build.files` no `package.json` (as libs do renderer ficam fora do pacote porque já vão no bundle do Vite). O `scripts/check-package.mjs` barra o build se isso for violado.
- **Build de teste fora de `out/`:** use caminho absoluto em `npx electron-vite build --outDir <caminho absoluto>`; com caminho relativo o renderer é gerado dentro de `src/renderer/`.
- **Nova versão:** suba `version` no `package.json`, acrescente a seção no `CHANGELOG.md` e atualize os nomes dos instaladores no `README.md` e em `docs/guia-de-teste.md`.
- **Novo serviço externo ou novo dado enviado:** atualize `docs/privacidade.md` e a tabela de serviços do `ARCHITECTURE.md`.

---

## 5. Como o Claude e o Antigravity Devem Colaborar

- Sempre consulte o `ROADMAP.md` antes de iniciar uma nova funcionalidade para manter a ordem lógica das fases.
- Ao adicionar novas chamadas de IPC:
  1. Adicione o canal em `src/shared/constants/ipc-channels.ts`.
  2. Adicione os tipos de Request/Response em `src/shared/types/ipc.ts`.
  3. Implemente o handler no backend em `src/main/ipc/`.
  4. Exponha o método no `src/preload/index.ts`.
  5. Consuma no `renderer` através de `window.electronAPI`.
- Mantenha testes de fumaça manuais simples e instruções claras de como testar cada entrega.
