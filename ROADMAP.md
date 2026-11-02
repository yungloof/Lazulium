# 🗺️ Roadmap de Desenvolvimento - Lazulium (Steam 2)

Este roadmap organiza a implementação dos 6 pilares do aplicativo em sprints modulares e bem delimitadas.

---

## 📍 Fase 1: Fundação & Arquitetura Base
- [x] Inicialização do repositório Git em `F:\projetos\SteamGridForge`.
- [x] Definição detalhada da arquitetura técnica (`ARCHITECTURE.md`).
- [x] Guia de engenharia e diretrizes para IA / desenvolvedores (`CLAUDE.md`).
- [x] Estrutura de diretórios modular (`src/main`, `src/preload`, `src/renderer`, `src/shared`).
- [x] Configuração do `package.json`, `tsconfig.json`, `electron-builder` e scripts de execução.
- [x] Implementação da camada de banco de dados SQLite local (`src/main/database/`).
- [x] Implementação da ponte IPC segura (`ContextBridge`) com contratos fortemente tipados.
- [x] Shell da interface React básica com tema escuro (Dark OLED) e layout responsivo.

---

## 🎮 Fase 2: Scanners de Plataformas & Catálogo Universal
- [x] **Steam Scanner:** Detecção automática de bibliotecas nos discos e leitura de `appmanifest_<id>.acf`.
- [x] **Epic Games Scanner:** Parse de manifests JSON em `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests`.
- [x] **GOG Galaxy Scanner:** Leitura do registro do Windows e pastas padrão de instalação.
- [x] **Emuladores Scanner:** 
  - [x] Mapeamento de perfis de emuladores (Dolphin, Ryujinx, Cemu, PCSX2, RPCS3, DuckStation).
  - [x] Varredura de pastas de ROMs configuráveis pelo usuário.
  - [x] Geração automática de linha de comando com flags fullscreen/boot direto.
- [x] **Jogos Customizados / Standalone:** Diálogo para adicionar qualquer `.exe` manualmente.
- [x] Exibição unificada da biblioteca na interface (filtros por plataforma, gênero, favoritos, busca).

---

## ⏱️ Fase 3: Monitor de Processos & Rastreador de Horas
- [x] Módulo de lançamento de jogos com desacoplamento de subprocessos (`launchUri` ou `spawn` detached).
- [x] Monitor de tempo real (process polling) via WMI/CIM em worker PowerShell persistente.
- [x] Cálculo preciso de tempo de jogo (`total_playtime_seconds`), com filtro de sessões < 15s.
- [x] Registro histórico de sessões (data, hora de início, término, duração).
- [x] Fechamento inesperado do jogo/launcher (tolerância de handoff) e do próprio Lazulium (recuperação via heartbeat).
- [ ] Tratamento de idle (jogador AFK com o jogo aberto).
- [x] Indicadores em tempo real na UI (Iniciando / Em execução / cronômetro / Parar).
- [x] Cards de estatísticas na UI (última vez jogado, gráficos de tempo semanal).

---

## 🎨 Fase 4: Integração SteamGridDB & Gerenciador de Mídia
- [x] Conexão com a API oficial do SteamGridDB (`v2`), com chave configurável e teste de validade.
- [x] Chave de API armazenada cifrada (Electron `safeStorage`, prefixo `enc:`) e decifrada apenas em memória.
- [x] Busca automática de artes para jogos sem capa (após scan, jogo manual ou nova chave) e quando uma arte remota retorna 404.
- [x] Download e cache local (`userData/cache/media/<jogo>/`, servido via `lazulium-media://`) de:
  - **Grids** (Capa vertical 600x900).
  - **Heroes** (Banner 1920x620).
  - **Logos** (PNG transparente com logo do jogo).
  - **Icons** (Ícones em alta definição).
- [x] Interface visual para o usuário trocar manualmente as artes (seletor de capas do SteamGridDB).
- [x] Exibir o logo do jogo sobre o Hero (spotlight), com fallback para o título em texto.

---

## 🏆 Fase 5: Sistema Unificado de Conquistas
- [x] **Steam Web API:**
  - Configuração de chave de API e SteamID64 nas configurações com cifragem `safeStorage` (`enc:`).
  - Sincronização de conquistas de jogos da Steam (desbloqueadas e bloqueadas com progresso, datas e raridade global).
  - Resiliência contra perfis privados ou dados ocultos da Steam.
- [x] **RetroAchievements API:**
  - Configuração de usuário e Web API Key do RetroAchievements com cifragem `safeStorage` (`enc:`).
  - Identificação de ROMs por hash MD5 do arquivo e fallback por título limpo (`cleanRomTitle`).
  - Sincronização de badges (coloridas e cinza), pontos e conquistas de jogos retrô/emulados.
- [x] Visualizador de conquistas (`AchievementsPanel.tsx`) com grade de badges, porcentagens de conclusão, filtros (Todas, Desbloqueadas, Bloqueadas), busca textual e atalho no hero spotlight.
- [x] Cache persistido no JSON store com TTL de 6 horas e botão de sincronização manual.

---

## ☁️ Fase 6: Backup Automático de Saves (Google Drive)
- [ ] Mapeador de diretórios de saves (jogos de PC e pastas de saves de emuladores).
- [ ] Fluxo de autenticação OAuth2 com Google Drive.
- [ ] Compactação automática em `.zip` e geração de hash de integridade.
- [ ] Disparo automático de backup ao encerrar a sessão de jogo.
- [ ] Histórico de backups e botão de "Restaurar Save" na interface.

---

## 🕹️ Fase 7: Navegação por Controle & Big Picture Mode
- [ ] Hook de captura de controle `useGamepad` via HTML5 Gamepad API.
- [ ] Engine de navegação espacial (Spatial Navigation 2D Grid) com foco em cartões, botões e abas.
- [ ] Mapeamento padrão de botões (A = Selecionar/Jogar, B = Voltar, X = Favoritar, Y = Buscar, LB/RB = Filtros).
- [ ] Alternância entre "Modo Desktop" e "Modo Big Picture / Console".
- [ ] Efeitos visuais e sonoros sutis de navegação.

---

## 📦 Fase 8: Polimento, Otimizações & Instalador .exe
- [ ] Empacotamento com `electron-builder` gerando instalador Windows (`.exe` NSIS) e versão portátil.
- [ ] Configuração de ícone do aplicativo e metadados de versão.
- [ ] Modo de inicialização minimizado na bandeja do sistema (System Tray) para rodar com consumo mínimo de RAM.
- [ ] Testes de distribuição para amigos.
