# Roadmap do Lazulium

As fases 1 a 11 e as versões de teste fecharam na 1.0. O que ficou para depois está em [Depois da 1.0](#depois-da-10); as novidades para quem joga estão no [CHANGELOG](CHANGELOG.md).

---

## Fase 1: Fundação & Arquitetura Base
- [x] Inicialização do repositório Git em `F:\projetos\SteamGridForge`.
- [x] Definição detalhada da arquitetura técnica (`ARCHITECTURE.md`).
- [x] Guia de engenharia e diretrizes para IA / desenvolvedores (`CLAUDE.md`).
- [x] Estrutura de diretórios modular (`src/main`, `src/preload`, `src/renderer`, `src/shared`).
- [x] Configuração do `package.json`, `tsconfig.json`, `electron-builder` e scripts de execução.
- [x] Implementação da camada de banco de dados local (`src/main/database/`): banco JSON (`lazulium_db.json`) no lugar do SQLite previsto, com segredos cifrados pelo `safeStorage`.
- [x] Implementação da ponte IPC segura (`ContextBridge`) com contratos fortemente tipados.
- [x] Shell da interface React básica com tema escuro (Dark OLED) e layout responsivo.

---

## Fase 2: Scanners de Plataformas & Catálogo Universal
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

## Fase 3: Monitor de Processos & Rastreador de Horas
- [x] Módulo de lançamento de jogos com desacoplamento de subprocessos (`launchUri` ou `spawn` detached).
- [x] Monitor de tempo real (process polling) via WMI/CIM em worker PowerShell persistente.
- [x] Cálculo preciso de tempo de jogo (`total_playtime_seconds`), com filtro de sessões < 15s.
- [x] Registro histórico de sessões (data, hora de início, término, duração).
- [x] Fechamento inesperado do jogo/launcher (tolerância de handoff) e do próprio Lazulium (recuperação via heartbeat).
- [x] Tratamento de idle (jogador AFK com o jogo aberto).
- [x] Indicadores em tempo real na UI (Iniciando / Em execução / cronômetro / Parar).
- [x] Cards de estatísticas na UI (última vez jogado, gráficos de tempo semanal).

---

## Fase 4: Integração SteamGridDB & Gerenciador de Mídia
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

## Fase 5: Sistema Unificado de Conquistas
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

## Fase 6: Backup Automático de Saves (Google Drive)
- [x] Mapeador de diretórios de saves: Steam Cloud local (`userdata/<conta>/<appid>/remote`), pastas com o nome do jogo em Documentos/My Games/Jogos Salvos/AppData e pastas dos emuladores (RetroArch por ROM, PCSX2, DuckStation, Dolphin, Ryujinx, Cemu, RPCS3), além de pastas escolhidas manualmente.
- [x] Fluxo de autenticação OAuth2 com Google Drive (app desktop: navegador + loopback + PKCE, escopo `drive.file`, refresh token cifrado com `safeStorage`).
- [x] Compactação automática em `.zip` com manifesto, SHA-256 por arquivo e do `.zip` inteiro (validados antes de restaurar).
- [x] Disparo automático de backup ao encerrar a sessão de jogo (pula quando os saves não mudaram; na primeira vez adota só pastas de alta confiança).
- [x] Histórico de backups (locais + somente-Drive, 10 por jogo) e botão de "Restaurar Save" com cópia de segurança dos saves atuais.

---

## Fase 7: Navegação por Controle
- [x] Hook de captura de controle `useGamepad` via HTML5 Gamepad API.
- [x] Engine de navegação espacial (Spatial Navigation 2D Grid) com foco em cartões, botões e abas.
- [x] Mapeamento padrão de botões (A = Selecionar/Jogar, B = Voltar, X = Favoritar, Y = Buscar, LB/RB = Filtros).
- [x] ~~Modo Big Picture~~ removido a pedido de Lazuli (a navegação por controle continua no layout único).
- [x] Efeitos visuais e sonoros sutis de navegação.

---

## Fase 8: Polimento, Otimizações & Instalador .exe
- [x] Empacotamento com `electron-builder` gerando instalador Windows (`dist/Lazulium-Setup-<versão>.exe`, NSIS por usuário) e versão portátil (`dist/Lazulium-Portable-<versão>.exe`) via `npm run build:win`.
- [x] Configuração de ícone do aplicativo (`resources/`, gerado por `npm run icons`) e metadados de versão (`productName`, `appId`, autor, copyright).
- [x] Bandeja do sistema (System Tray) com "Abrir Lazulium", "Escanear Biblioteca" e "Sair"; minimizar para a bandeja ao fechar, instância única e opção "Iniciar com o Windows" direto na bandeja. Janela escondida é destruída após 60 s para liberar a RAM do renderer.
- [x] Notificações nativas do Windows quando um backup de save termina em segundo plano.
- [x] Funcionamento offline: aviso de "sem conexão", cache de conquistas preservado, fila de artes pausada e reenvio automático ao Drive dos backups que falharam.
- [x] Ajuste manual do tempo jogado para jogos que não são da Steam.
- [x] Polling do controle só roda com um gamepad conectado.
- [x] Login por conta em vez de chaves de API: Steam (conta do cliente da Steam deste PC ou OpenID no navegador; conquistas pelo perfil público, sem chave), SteamGridDB e RetroAchievements (janela de login que captura e valida a chave sozinha) e Google (client OAuth embutido no build via `.env`). Chaves manuais ficaram em "Avançado".
- [x] Testes de distribuição para amigos (versões 0.1.0 e 0.2.0; os da 1.0 seguem em [Depois da 1.0](#depois-da-10)).

---

## Fase 9: Galeria, Perfil do Jogador & Estabilidade
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

## Fase 10: Diário de Jogos (registro permanente)
- [x] Desinstalar nunca apaga: jogos ficam como "não instalados", com horas, conquistas, sessões e registro guardados; reinstalar (mesmo em outra pasta) continua o histórico.
- [x] Histórico da Steam importado do `localconfig.vdf`, com nomes do cache local `appinfo.vdf` (e da loja da Steam para os que faltam), incluindo jogos desinstalados.
- [x] Página Diário: todos os jogos com filtros, ordenação, status, nota e tempo; registro de jogos à mão (console, outro PC); exportação em JSON e CSV.
- [x] "Meu registro" na página do jogo: status, nota, datas de início e fim e anotações.
- [x] Edição de horas e da última sessão em jogos fora da Steam; em atalhos da Steam vira um ajuste sobre o valor da Steam, que sobrevive aos scans e continua somando.
- [x] Banco protegido: gravação atômica, cópia diária (14 dias) e recuperação automática se o arquivo corromper.

---

## Fase 11: Perfil, Galeria e Artes
- [x] Artes em `userData/artwork` (antes em `userData/cache`, que no Windows é a pasta do cache do Chromium e era limpa sozinha), com migração e reparo das perdidas.
- [x] Aba Capturas com as imagens separadas por jogo, "Ver todas" e exclusão pelo app (vai para a Lixeira).
- [x] Perfil editável: nome, bio, avatar, banner, jogos e conquistas em destaque, seções visíveis e sua ordem; visual reorganizado.
- [x] Perfil com a identidade da Steam (fundo animado, moldura, bio, vitrine e insígnias, sem chave de API e guardados para uso offline), tudo substituível no editor.
- [x] Horas das últimas 2 semanas pela página pública da Steam: `Playtime2wks` do `localconfig.vdf` fica desatualizado e, em atalhos, repete o total.
- [x] Diário com resenha e anotações, salvamento automático e sem limite prático de texto.

---

## Versões de teste 0.1.x (até 9/11/2026)
- [x] Preparação para distribuição: primeira execução testada num perfil limpo; tela de boas-vindas (jogos encontrados + contas), log de diagnóstico em `%APPDATA%\Lazulium\logs\lazulium.log` com botão "Abrir pasta de logs" nas Configurações, scans em fila (sem trabalho dobrado na primeira execução).
- [x] Revisão pré-release: desconto de ausência considera controle XInput (antes descontava sessões jogadas de controle), `fflate` sem alertas no `npm audit`, executáveis (desempacotado e portátil) testados em modo silencioso num perfil limpo.
- [x] Client OAuth do Google no `.env` do build oficial, para o "Entrar com Google" funcionar para todos.
- [x] Tratamento de idle (jogador AFK com o jogo aberto).
- [x] Publicar a página web do perfil a partir do app (Perfil → Publicar na web, GitHub Pages pelo login do Git, sem chave de API).
- [x] Perfil para quem abre pela primeira vez: conexão da Steam em um clique na própria tela e aviso de como liberar um perfil privado.
- [x] Registro do jogo e Diário refeitos (status em botões, nota com legenda, resenha em espaço amplo, cartões e filtros à vista) e nova identidade visual: azul-noite com azul vivo e cantos suaves.
- [x] Jogos da Família Steam identificados pelo dono no manifest (`LastOwner`), com a marca guardada depois de desinstalar.
- [x] Abrir a pasta de qualquer jogo instalado; capas inteiras e sem cantos cortados; Diário só com jogos registrados.
- [x] Emuladores detectados sozinhos: executáveis pelos atalhos e por uma busca limitada no disco, pastas de jogos lidas da configuração de cada emulador, sem duplicar atalhos da Steam. Novos perfis: Eden/yuzu, Azahar/Citra, melonDS, mGBA, PPSSPP e BizHawk.
- [x] Atalhos da Steam que abrem ROM viram jogos de emulador (backup de saves, RetroAchievements onde existe); seção O que jogar agora; retrospectiva do ano no Perfil.
- [x] Controle navega por todas as telas e janelas (direcional, A/B/X/Y, LB/RB, LT/RT, Start), ignora botões com a janela sem foco; erro de tela mostra aviso com "Recarregar".
- [x] Listas de jogos (ordem, ranqueada, destaque no Perfil); Perfil com banner, números, abas, resenhas e mapa de atividade; Diário com capas, meses e meia estrela; menus do próprio app no lugar do select nativo.
- [x] Capturas mudam de jogo sem tocar no arquivo (Spacewar); registrar jogo busca na biblioteca, no IGDB e na loja da Steam; todas as conquistas marcam 100% sozinho, sem insistir se o jogador mudar.
- [x] RetroAchievements: conquistas atualizam ao entrar na conta, nome igual ao catálogo, aviso claro de emulador sem suporte ou que não envia conquistas.
- [x] Backup de saves automático: ao fechar o jogo e uma passada diária no que mudou, com pasta por jogo no Drive e "Restaurar o mais recente".
- [x] Captura de tela por tecla durante o jogo (padrão Ctrl+F12), em PNG sem perda, na galeria do jogo; "Capturar em 5 s" para jogos abertos por fora.
- [x] Renomear jogos e ocultar pelo menu, com lista de ocultos nas Configurações; biblioteca com ordenação e filtro por status; busca rápida Ctrl+K.
- [x] Opções de inicialização por atalho (direto ou pela Steam, argumentos próprios); progresso em relação ao tempo para zerar; aviso de sessão oferece marcar como Jogando.
- [x] Aba Desejos: lista da Steam, preço em reais, menor preço visto, preço-alvo e aviso de promoção. Painel geral de backups nas Configurações.
- [x] Conquistas para todos os jogos, com o mesmo destaque: Steam, RetroAchievements (sincronizadas ou marcadas à mão, inclusive em ports, pela lista achada pelo nome), marcos do Lazulium onde não existe lista, e conquistas criadas pelo jogador.
- [x] Lista de desejos compara preços de outras lojas pelo GG.deals (chave guardada no servidor, em `/v1/prices`).
- [x] Interface: barra única no topo, fontes Inter e Outfit embutidas, capas inteiras com nome embaixo, ações da página do jogo agrupadas em "Mais opções", faixa de botões só com controle conectado.
- [x] Duração típica na página dos jogos Steam, estimada pelas horas das reviews positivas (alternativa sem chave ao HowLongToBeat).
- [x] Tempo para zerar pelo IGDB em qualquer jogo, por um servidor próprio (`server/igdb-proxy`) que guarda a credencial; as reviews da Steam ficam como reserva.
- [x] Publicar o servidor do IGDB e colocar a URL em `IGDB_PROXY_URL` (passos em `server/igdb-proxy/README.md`).

---

## Versão 0.2.0: aparência e receitas de lançamento (10/11/2026)
- [x] Backup automático de saves só com consentimento (boas-vindas e Configurações) e limite de espaço em disco.
- [x] Perfil não conta mais os marcos do Lazulium como conquistas.
- [x] Editor de aparência: presets, cores de superfície, destaque, texto, partes e avisos, fontes, tamanho, cantos, importar/exportar tema.
- [x] Receitas de lançamento por jogo: variáveis de ambiente, comando antes/depois e exportação para .bat.

---

## Versão 1.0.0: primeira versão pública (10/11/2026)
- [x] Emuladores personalizados com modelo de comando (`{rom}`, `{romname}`, `{romdir}`, `{core}`) e presets compartilháveis em JSON.
- [x] Componentes base de interface (`components/ui/`: Modal, Button, Notice, EmptyState, Skeleton, SectionHeader) e estado da casca do app em stores Zustand (`useUiStore`, `useLibraryViewStore`) no lugar de props.
- [x] Pedidos HTTP do main num lugar só (`services/metadata/http.ts`): tempo limite, nova tentativa em falha passageira e erros em português sem a URL (que pode levar chave de API).
- [x] Banco com versão de formato (`schemaVersion`, conversão em `database/normalize.ts`) e leitura tolerante a arquivo preso por antivírus (`database/storage.ts`); handlers IPC divididos por domínio em `src/main/ipc/`.
- [x] Empacotamento: instalador NSIS em português com imagens próprias (`npm run icons`), sem as bibliotecas do renderer no `app.asar` (35,7 MB → ~2 MB), só os idiomas pt-BR e en-US do Chromium e conferência do pacote antes do electron-builder (`scripts/check-package.mjs`).
- [x] Renderer minificado e dividido em partes (`react`, `icons` e páginas com `React.lazy`): 1,25 MB → ~0,58 MB de JS.
- [x] Documentação para quem usa: README para amigos, guia de teste da 1.0, [política de privacidade](docs/privacidade.md), [CHANGELOG](CHANGELOG.md) e licença MIT.

---

## Versão 1.1.0: menos contas e caminho para a 2.0 (11/11/2026)
- [x] Capas e fundos sem conta do SteamGridDB, pelo servidor (`/v1/artwork`, IGDB). SteamGridDB fica opcional.
- [x] Configurações → Contas em grupos: você, progresso, lojas no PC, nuvem e opcional.
- [x] Linha do tempo do jogador (`activity.service.ts`) no Perfil, base do feed da 2.0.
- [x] Tela de Novidades depois de atualizar, progresso do download e botão de atualizar na barra do topo. Portátil avisa e leva ao download.
- [x] Plano da conta Lazulium com amigos em [docs/conta-lazulium.md](docs/conta-lazulium.md).

---

## Versão 2.4.0: categorias na biblioteca (12/11/2026)
- [x] Categorias criadas pelo jogador (`gameCategories` no banco, `services/library/categories.service.ts`): lista lateral agrupada por categoria ou por plataforma, arrastar e soltar, janela de organizar, filtro da biblioteca.
- [ ] Depois: categorias dinâmicas (por status, plataforma, nota) e importar as coleções da Steam.

## Versão 2.2.0: vitrine dos amigos (12/11/2026)
- [x] Perfil do amigo mostra a vitrine que ele decorou (a página do perfil web, servida pelo `server/social` por link de 30 min numa moldura isolada) e a aba Comparar.
- [x] App envia a vitrine e as imagens escolhidas (avatar, fundo, arte) reduzidas; chave *Vitrine do perfil*.

## Versão 2.1.0: horas em qualquer loja (11/11/2026)
- [x] Contar o tempo de jogos abertos fora do Lazulium (Epic, GOG, EA, atalhos), com chave em Comportamento.
- [x] Entrar com a Epic (opcional) para importar as horas de cada jogo.
- [x] Amigos: capa padrão (IGDB ou Steam conferida) para os jogos e aviso "Fulano começou a jogar X".
- [ ] Testar o login da Epic numa conta real.

## Versão 2.0.0: conta Lazulium com amigos (11/11/2026)
- [x] Servidor `server/social` (Cloudflare Worker + D1; `server.mjs` com SQLite para VPS e testes): login pela Steam verificado no servidor, convites, amizades, jogando agora, feed, perfil de amigo e apagar conta. 16 testes.
- [x] App: `services/social/social.service.ts` (login com retorno em `127.0.0.1`, envio da linha do tempo e do resumo, jogando agora pelo tracker), aba Amigos, perfil de amigo e conta em Configurações → Contas com as chaves de privacidade.
- [x] Capa pública guardada junto com a capa baixada (`media.coverSourceUrl`) para aparecer no feed dos amigos.
- [x] Política de privacidade com a seção da conta Lazulium.
- [ ] Publicar: criar o D1, aplicar o `schema.sql`, `wrangler deploy` do `server/social` e regenerar a página `/privacidade` do `igdb-proxy`.
- [ ] Depois: comparar conquistas lado a lado, notas dos amigos na página do jogo, listas compartilhadas, sincronizar o Diário entre PCs.

---

## Depois da 1.0
Passos que só o dono pode fazer estão detalhados em [docs/publicar-1.0.md](docs/publicar-1.0.md).

**Publicação**
- [x] Criar o repositório e a Release `v1.0.0` no GitHub (instalador, `.blockmap` e `latest.yml`, publicada em 11/11/2026).
- [ ] Ativar o GitHub Pages da pasta `docs/`.
- [x] Tirar o OAuth do Google do modo de teste (em produção desde 10/11/2026).
- [x] Publicar o `/v1/prices` no Worker com a chave do GG.deals (`wrangler secret put GGDEALS_API_KEY`) e conferir o formato real da resposta. Ativo desde 11/11/2026, também na VPS.
- [ ] Primeira publicação real do perfil no GitHub pelo app: conferir login do Git, ativação do Pages e a página no ar.

**Testes manuais**
- [ ] Instalador NSIS da 1.0: instalar "Apenas para mim", atalhos, instalar por cima da 0.2.0 e desinstalar mantendo `%APPDATA%\Lazulium`.
- [ ] Abrir um atalho não-Steam e o Minecraft pelo Lazulium e conferir a sessão registrada.
- [ ] Testes de distribuição com amigos (instalador e versão portátil em outros PCs).

**Funcionalidades**
- [x] Atualização automática pelo GitHub (`electron-updater`, provider `github`; plano em `docs/publicar-1.0.md`).
- [ ] Assinatura digital do instalador (evita o aviso do SmartScreen; opções e custos em `docs/publicar-1.0.md`).
- [x] "Adicionar à Steam" (atalho não-Steam) a partir do Lazulium com artes personalizadas sincronizadas em `userdata/<conta>/config/grid`.
- [x] Scanners de outros lançadores (Battle.net, EA App, Ubisoft Connect).
- [x] Horas e última sessão da Epic (eglv2 `last-played.json`) e do GOG (`galaxy-2.0.db`) importadas dos lançadores.
