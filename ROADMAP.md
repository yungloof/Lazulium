# 🗺️ Roadmap de Desenvolvimento - SteamGridForge (Steam 2)

Este roadmap organiza a implementação dos 6 pilares do aplicativo em sprints modulares e bem delimitadas.

---

## 📍 Fase 1: Fundação & Arquitetura Base (Sprint Atual)
- [x] Inicialização do repositório Git em `F:\projetos\SteamGridForge`.
- [x] Definição detalhada da arquitetura técnica (`ARCHITECTURE.md`).
- [x] Guia de engenharia e diretrizes para IA / desenvolvedores (`CLAUDE.md`).
- [x] Estrutura de diretórios modular (`src/main`, `src/preload`, `src/renderer`, `src/shared`).
- [ ] Configuração do `package.json`, `tsconfig.json`, `electron-builder` e scripts de execução.
- [ ] Implementação da camada de banco de dados SQLite local (`src/main/database/`).
- [ ] Implementação da ponte IPC segura (`ContextBridge`) com contratos fortemente tipados.
- [ ] Shell da interface React básica com tema escuro (Dark OLED) e layout responsivo.

---

## 🎮 Fase 2: Scanners de Plataformas & Catálogo Universal
- [ ] **Steam Scanner:** Detecção automática de bibliotecas nos discos e leitura de `appmanifest_<id>.acf`.
- [ ] **Epic Games Scanner:** Parse de manifests JSON em `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests`.
- [ ] **GOG Galaxy Scanner:** Leitura do registro do Windows e pastas padrão de instalação.
- [ ] **Emuladores Scanner:** 
  - Mapeamento de perfis de emuladores (Dolphin, Ryujinx, Cemu, PCSX2, RPCS3, DuckStation).
  - Varredura de pastas de ROMs configuráveis pelo usuário.
  - Geração automática de linha de comando com flags fullscreen/boot direto.
- [ ] **Jogos Customizados / Standalone:** Diálogo para adicionar qualquer `.exe` manualmente.
- [ ] Exibição unificada da biblioteca na interface (filtros por plataforma, gênero, favoritos, busca).

---

## ⏱️ Fase 3: Monitor de Processos & Rastreador de Horas
- [ ] Módulo de lançamento de jogos com desacoplamento de subprocessos.
- [ ] Monitor de tempo real (process polling) via Windows Process API / WMI.
- [ ] Cálculo preciso de tempo de jogo (`total_playtime_seconds`).
- [ ] Registro histórico de sessões (data, hora de início, término, duração).
- [ ] Tratamento de idle e fechamento inesperado do jogo ou do launcher.
- [ ] Cards de estatísticas na UI (tempo total, última vez jogado, gráficos de tempo semanal).

---

## 🎨 Fase 4: Integração SteamGridDB & Gerenciador de Mídia
- [ ] Conexão com a API oficial do SteamGridDB (`v2`).
- [ ] Busca automática de metadados ao catalogar um jogo novo.
- [ ] Download e cache local de:
  - **Grids** (Capa vertical 600x900).
  - **Heroes** (Banner 1920x620).
  - **Logos** (PNG transparente com logo do jogo).
  - **Icons** (Ícones em alta definição).
- [ ] Interface visual para o usuário trocar manualmente as artes (seletor de capas do SteamGridDB).

---

## 🏆 Fase 5: Sistema Unificado de Conquistas
- [ ] **Steam Web API:**
  - Configuração de chave de API e SteamID64 nas configurações.
  - Sincronização de conquistas de jogos da Steam (desbloqueadas e bloqueadas com progresso e datas).
- [ ] **RetroAchievements API:**
  - Configuração de usuário e Web API Key do RetroAchievements.
  - Identificação de ROMs por hash MD5 ou título.
  - Sincronização de badges e conquistas de jogos retrô/emulados.
- [ ] Visualizador de conquistas na tela de detalhes do jogo com badges, porcentagens e filtros.

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
