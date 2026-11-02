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
- [x] Mapeador de diretórios de saves: Steam Cloud local (`userdata/<conta>/<appid>/remote`), pastas com o nome do jogo em Documentos/My Games/Jogos Salvos/AppData e pastas dos emuladores (RetroArch por ROM, PCSX2, DuckStation, Dolphin, Ryujinx, Cemu, RPCS3), além de pastas escolhidas manualmente.
- [x] Fluxo de autenticação OAuth2 com Google Drive (app desktop: navegador + loopback + PKCE, escopo `drive.file`, refresh token cifrado com `safeStorage`).
- [x] Compactação automática em `.zip` com manifesto, SHA-256 por arquivo e do `.zip` inteiro (validados antes de restaurar).
- [x] Disparo automático de backup ao encerrar a sessão de jogo (pula quando os saves não mudaram; na primeira vez adota só pastas de alta confiança).
- [x] Histórico de backups (locais + somente-Drive, 10 por jogo) e botão de "Restaurar Save" com cópia de segurança dos saves atuais.

---

## 🕹️ Fase 7: Navegação por Controle & Big Picture Mode
- [x] Hook de captura de controle `useGamepad` via HTML5 Gamepad API.
- [x] Engine de navegação espacial (Spatial Navigation 2D Grid) com foco em cartões, botões e abas.
- [x] Mapeamento padrão de botões (A = Selecionar/Jogar, B = Voltar, X = Favoritar, Y = Buscar, LB/RB = Filtros).
- [x] Alternância entre "Modo Desktop" e "Modo Big Picture / Console".
- [x] Efeitos visuais e sonoros sutis de navegação.

---

## 📦 Fase 8: Polimento, Otimizações & Instalador .exe
- [x] Empacotamento com `electron-builder` gerando instalador Windows (`dist/Lazulium-Setup-<versão>.exe`, NSIS por usuário) e versão portátil (`dist/Lazulium-Portable-<versão>.exe`) via `npm run build:win`.
- [x] Configuração de ícone do aplicativo (`resources/`, gerado por `npm run icons`) e metadados de versão (`productName`, `appId`, autor, copyright).
- [x] Bandeja do sistema (System Tray) com "Abrir Lazulium", "Escanear Biblioteca" e "Sair"; minimizar para a bandeja ao fechar, instância única e opção "Iniciar com o Windows" direto na bandeja. Janela escondida é destruída após 60 s para liberar a RAM do renderer.
- [x] Notificações nativas do Windows quando um backup de save termina em segundo plano.
- [x] Funcionamento offline: aviso de "sem conexão", cache de conquistas preservado, fila de artes pausada e reenvio automático ao Drive dos backups que falharam.
- [x] Ajuste manual do tempo jogado para jogos que não são da Steam.
- [x] Polling do controle só roda com um gamepad conectado.
- [ ] Testes de distribuição para amigos.
