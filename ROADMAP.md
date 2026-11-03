# 🗺️ Roadmap de Desenvolvimento - Lazulium (Steam 2)

Este roadmap organiza a implementação do aplicativo em fases modulares e bem delimitadas.

> **Versão 0.1.0:** Fases 1 a 9 concluídas. Itens ainda abertos estão em [Depois da 0.1.0](#-depois-da-010).

---

## 📍 Fase 1: Fundação & Arquitetura Base
- [x] Inicialização do repositório Git em `F:\projetos\SteamGridForge`.
- [x] Definição detalhada da arquitetura técnica (`ARCHITECTURE.md`).
- [x] Guia de engenharia e diretrizes para IA / desenvolvedores (`CLAUDE.md`).
- [x] Estrutura de diretórios modular (`src/main`, `src/preload`, `src/renderer`, `src/shared`).
- [x] Configuração do `package.json`, `tsconfig.json`, `electron-builder` e scripts de execução.
- [x] Implementação da camada de banco de dados local (`src/main/database/`): banco JSON (`lazulium_db.json`) no lugar do SQLite previsto, com segredos cifrados pelo `safeStorage`.
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
- [x] Tratamento de idle (jogador AFK com o jogo aberto).
- [x] Indicadores em tempo real na UI (Iniciando / Em execução / cronômetro / Parar).
- [x] Cards de estatísticas na UI (última vez jogado, gráficos de tempo semanal).

---

## 🎨 Fase 4: Integração SteamGridDB & Gerenciador de Mídia
- [x] Conexão com a API oficial do SteamGridDB (`v2`), com chave configurável e teste de validade.
- [x] Chave de API armazenada cifrada (Electron `safeStorage`, prefixo `enc:`) e decifrada apenas em memória.
- [x] Busca automática de artes para jogos sem capa (após scan, jogo manual ou nova chave) e quando uma arte remota retorna 404.
- [x] Download e cache local (`userData/artwork/<jogo>/`, servido via `lazulium-media://`) de:
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

## 🕹️ Fase 7: Navegação por Controle
- [x] Hook de captura de controle `useGamepad` via HTML5 Gamepad API.
- [x] Engine de navegação espacial (Spatial Navigation 2D Grid) com foco em cartões, botões e abas.
- [x] Mapeamento padrão de botões (A = Selecionar/Jogar, B = Voltar, X = Favoritar, Y = Buscar, LB/RB = Filtros).
- [x] ~~Modo Big Picture~~ removido a pedido do dono do projeto (a navegação por controle continua no layout único).
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
- [x] Login por conta em vez de chaves de API: Steam (conta do cliente da Steam deste PC ou OpenID no navegador; conquistas pelo perfil público, sem chave), SteamGridDB e RetroAchievements (janela de login que captura e valida a chave sozinha) e Google (client OAuth embutido no build via `.env`). Chaves manuais ficaram em "Avançado".
- [ ] Testes de distribuição para amigos.

---

## 🖼️ Fase 9: Galeria, Perfil do Jogador & Estabilidade
- [x] Galeria de capturas por jogo: F12 da Steam (`userdata/<conta>/760/remote/<appid>/screenshots`, com miniaturas), jogos não-Steam adicionados à Steam (via `shortcuts.vdf`), Xbox Game Bar (`Vídeos\Capturas`) e imagens anexadas no Lazulium; visualizador em tela cheia com setas e "Mostrar na pasta".
- [x] Perfil do jogador unificado: horas somando todas as plataformas, conquistas desbloqueadas e jogos 100%, vitrine das conquistas mais raras, mais jogados, favoritos e jogados recentemente; avatar e nome da Steam.
- [x] "Atualizar conquistas" de todos os jogos jogados e exportação do perfil em JSON (`lazulium-profile/1`, só URLs públicas) para uma futura página web.
- [x] Caminhos claros em erros: avisos de conquistas sem corte e com "Abrir Contas", artes com "Abrir Contas" quando o SteamGridDB desconecta, backups com "Tentar enviar de novo"/"Reconectar o Drive", e a sincronização de horas da Steam ao abrir o app atualiza a janela.
- [x] Horas da Steam corrigidas: `localconfig.vdf` lido com o parser de VDF (blocos `cloud` antes de `Playtime` faziam jogos aparecerem como "Nunca jogado") e só da conta conectada/mais recente.
- [x] Atalhos não-Steam da Steam (`shortcuts.vdf`) importados como jogos, abrindo pela Steam e com as artes personalizadas de `config/grid`.
- [x] Scanners da Riot (registro de desinstalação, abre pelo Riot Client) e da Xbox/Microsoft Store (pacotes com `MicrosoftGame.config`); jogos abertos por lançador são rastreados pela pasta do jogo.
- [x] Página web pública do perfil (consumindo o JSON exportado).
- [x] Perfil como página completa no estilo da Steam (nível da conta, status, atividade das últimas 2 semanas, vitrine de capturas, mais jogados com progresso de conquistas) e visual com a paleta da Steam.

---

## 📓 Fase 10: Diário de Jogos (registro permanente)
- [x] Desinstalar nunca apaga: jogos ficam como "não instalados", com horas, conquistas, sessões e registro guardados; reinstalar (mesmo em outra pasta) continua o histórico.
- [x] Histórico da Steam importado do `localconfig.vdf`, com nomes do cache local `appinfo.vdf` (e da loja da Steam para os que faltam), incluindo jogos desinstalados.
- [x] Página Diário: todos os jogos com filtros, ordenação, status, nota e tempo; registro de jogos à mão (console, outro PC); exportação em JSON e CSV.
- [x] "Meu registro" na página do jogo: status, nota, datas de início e fim e anotações.
- [x] Edição de horas e da última sessão em jogos fora da Steam; em atalhos da Steam vira um ajuste sobre o valor da Steam, que sobrevive aos scans e continua somando.
- [x] Banco protegido: gravação atômica, cópia diária (14 dias) e recuperação automática se o arquivo corromper.

---

## 🎛️ Fase 11: Perfil, Galeria e Artes
- [x] Artes em `userData/artwork` (antes em `userData/cache`, que no Windows é a pasta do cache do Chromium e era limpa sozinha), com migração e reparo das perdidas.
- [x] Aba Capturas com as imagens separadas por jogo, "Ver todas" e exclusão pelo app (vai para a Lixeira).
- [x] Perfil editável: nome, bio, avatar, banner, jogos e conquistas em destaque, seções visíveis e sua ordem; visual reorganizado.
- [x] Perfil com a identidade da Steam (fundo animado, moldura, bio, vitrine e insígnias, sem chave de API e guardados para uso offline), tudo substituível no editor.
- [x] Horas das últimas 2 semanas pela página pública da Steam: `Playtime2wks` do `localconfig.vdf` fica desatualizado e, em atalhos, repete o total.
- [x] Diário com resenha e anotações, salvamento automático e sem limite prático de texto.

---

## 🔭 Depois da 0.1.0
- [x] Preparação para distribuição: primeira execução testada num perfil limpo; tela de boas-vindas (jogos encontrados + contas), log de diagnóstico em `%APPDATA%\Lazulium\logs\lazulium.log` com botão "Abrir pasta de logs" nas Configurações, scans em fila (sem trabalho dobrado na primeira execução).
- [x] Revisão pré-release: desconto de ausência considera controle XInput (antes descontava sessões jogadas de controle), `fflate` sem alertas no `npm audit`, executáveis (desempacotado e portátil) testados em modo silencioso num perfil limpo.
- [ ] Teste manual do instalador NSIS: instalar, atalhos e desinstalar mantendo `%APPDATA%\Lazulium`.
- [ ] Teste manual de jogo: abrir um atalho não-Steam e o Minecraft pelo Lazulium e conferir a sessão registrada.
- [ ] Testes de distribuição para amigos (instalador e versão portátil em outros PCs).
- [ ] Client OAuth do Google no `.env` do build oficial, para o "Entrar com Google" funcionar para todos.
- [x] Tratamento de idle (jogador AFK com o jogo aberto).
- [x] Publicar a página web do perfil a partir do app (Perfil → Publicar na web, GitHub Pages pelo login do Git, sem chave de API).
- [x] Perfil para quem abre pela primeira vez: conexão da Steam em um clique na própria tela e aviso de como liberar um perfil privado.
- [x] Registro do jogo e Diário refeitos (status em botões, nota com legenda, resenha em espaço amplo, cartões e filtros à vista) e nova identidade visual: azul-noite com azul vivo e cantos suaves.
- [x] Jogos da Família Steam identificados pelo dono no manifest (`LastOwner`), com a marca guardada depois de desinstalar.
- [x] Abrir a pasta de qualquer jogo instalado; capas inteiras e sem cantos cortados; Diário só com jogos registrados.
- [x] Emuladores detectados sozinhos: executáveis pelos atalhos e por uma busca limitada no disco, pastas de jogos lidas da configuração de cada emulador, sem duplicar atalhos da Steam. Novos perfis: Eden/yuzu, Azahar/Citra, melonDS, mGBA, PPSSPP e BizHawk.
- [x] Atalhos da Steam que abrem ROM viram jogos de emulador (backup de saves, RetroAchievements onde existe); seção O que jogar agora; retrospectiva do ano no Perfil.
- [ ] Primeira publicação real no GitHub: conferir login do Git, ativação do Pages e a página no ar.
- [ ] Scanners de outros lançadores (Battle.net, EA app, Ubisoft Connect) quando houver jogos instalados para validar.
- [ ] Assinatura digital do instalador (evita o aviso do SmartScreen).
