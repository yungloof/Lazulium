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
     - `services/cloudsync/`: Compacta saves e comunica com Google Drive.
     - `services/database/`: Consultas preparadas e migrações SQLite.

2. **Tipagem Estrita (Zero `any` desnecessário):**
   - Todos os tipos compartilhados entre o `main` e o `renderer` **devem** residir em `src/shared/types/`.
   - As chamadas IPC devem ser sempre tipadas através da interface `IpcApi` definida em `src/shared/types/ipc.ts`.

3. **Resiliência a Falhas:**
   - Erros no scanner da Epic Games ou em um emulador específico **nunca** devem quebrar o carregamento dos outros jogos. Todo scanner roda isolado em `try/catch` individual e loga avisos úteis.
   - O processo de monitoramento de playtime roda em segundo plano com overhead mínimo (consumo desprezível de CPU/RAM).

4. **Experiência do Usuário (Gamepad-First):**
   - Todos os componentes interativos devem ser acessíveis tanto por clique de mouse quanto por foco espacial de controle (D-Pad / Analógico).
   - Deve haver sempre um anel visual claro de foco (`ring-2 ring-primary`) para quando o controle estiver ativo.

---

## 2. Estrutura de Diretórios

```
Lazulium/
├── src/
│   ├── main/                    # Processo Principal do Electron (Node.js)
│   │   ├── index.ts             # Inicialização da janela e ciclo de vida
│   │   ├── ipc/                 # Handlers IPC registrados
│   │   ├── services/            # Serviços de negócio (Scanners, Tracker, etc.)
│   │   └── database/            # Conexão SQLite e queries
│   ├── preload/                 # Ponte de segurança (ContextBridge)
│   │   ├── index.ts             # Expõe electronAPI tipada
│   │   └── index.d.ts           # Extensão do objeto global Window
│   ├── renderer/                # Interface React + Vite + Tailwind
│   │   ├── src/
│   │   │   ├── components/      # Componentes visuais modulares
│   │   │   ├── hooks/           # Hooks (useGamepad, useSpatialNav, etc.)
│   │   │   ├── stores/          # Zustand state stores
│   │   │   ├── pages/           # Visualizações (Library, GameDetails, Settings)
│   │   │   └── styles/          # Tailwind e CSS global
│   └── shared/                  # Código compartilhado entre Main e Renderer
│       ├── types/               # Tipos TypeScript puros
│       └── constants/           # Enums, canais IPC, configurações padrão
├── ARCHITECTURE.md              # Documentação detalhada da arquitetura
├── ROADMAP.md                   # Fases de desenvolvimento
└── package.json
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

# Gerar build de produção (.exe instalador via electron-builder)
npm run build:win
```

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
