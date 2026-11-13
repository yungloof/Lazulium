<p align="center"><img src="resources/icon.png" alt="Logo do Lazulium" width="96" /></p>

# Lazulium

Todos os jogos do PC num lugar só: Steam, Epic, GOG, Battle.net, EA App, Ubisoft Connect, Riot, Xbox, emuladores e o que mais você tiver solto numa pasta. Com horas jogadas, conquistas, capturas, backup dos saves e aba Amigos opcional.

> Versão **2.5.3** · Windows 10 e 11 (64 bits) · Grátis, código aberto (MIT)

---

## O que é

Um lançador que fica por cima das lojas que você já usa. Ele acha os jogos instalados, baixa capa para todos e mostra tudo numa biblioteca que dá para usar no mouse, no teclado ou no controle.

Ninguém precisa largar a Steam: os jogos continuam abrindo pelos lançadores de sempre. O Lazulium só junta tudo e guarda o histórico.

O que eu mais queria ao fazer ele:

- Parar de abrir quatro lançadores para lembrar o que está instalado. Emulador e jogo avulso entram junto, com capa.
- Ter horas em qualquer jogo, não só nos da Steam. Fora dela, o Lazulium importa horas do GOG e da Epic, acompanha jogos abertos pelo app ou por fora e desconta quando você sai de perto do PC.
- Não perder o histórico ao desinstalar. Horas, conquistas e anotações ficam no Diário; reinstalou, segue de onde parou.
- Conquistas também em emulador, pelo RetroAchievements.
- Ver o que os amigos estão jogando, de qualquer loja, com feed e vitrine do perfil. Isso é com a conta Lazulium, que é opcional e entra pela Steam.
- Backup dos saves ao fechar o jogo, com cópia no Google Drive se você quiser.

Não pede senha nem chave de API (os logins são nos sites oficiais), não tem propaganda e não rastreia ninguém.

## Baixar e instalar

1. Baixe na [página de downloads](../../releases/latest):

   | Arquivo | |
   |---|---|
   | **`Lazulium-Setup-2.5.3.exe`** *(recomendado)* | Instala, cria atalhos e se atualiza sozinho. Não precisa de administrador. |
   | `Lazulium-Portable-2.5.3.exe` | Um arquivo só, sem instalar. Abre um pouco mais devagar. |

2. Se o navegador disser que o arquivo "não é baixado com frequência", escolha **Manter** (no Edge: **…** → **Manter** → **Mostrar mais** → **Manter mesmo assim**).

3. Se aparecer a tela azul "O Windows protegeu o computador", clique em **Mais informações** → **Executar assim mesmo**. Isso acontece porque o instalador não tem assinatura digital paga (é um projeto independente), não porque tem vírus.

4. No instalador, escolha **Apenas para mim** e clique em **Instalar**.

Na primeira vez ele mostra os jogos que achou e oferece conectar as contas. Dá para pular tudo e fazer depois em **Configurações**.

Ocupa cerca de 320 MB, mais os backups de saves se você ligar. Sem internet a biblioteca e a contagem de horas funcionam; capas, conquistas, preços, amigos e Drive não.

### Atualizar

A versão instalada procura atualização sozinha (ou em **Configurações → Ajuda e diagnóstico → Verificar atualizações**). Instalar a versão nova por cima também funciona, e nada se perde.

### Desinstalar

Pelo **Configurações do Windows → Aplicativos**, como qualquer programa. Os dados ficam em `%APPDATA%\Lazulium` caso você volte; para apagar de vez, apague essa pasta.

---

## Recursos

- **Lojas:** Steam (todas as bibliotecas, Família Steam, atalhos não-Steam e criação de atalhos com artes), Epic Games, GOG Galaxy, Battle.net, EA App, Ubisoft Connect, Riot Games, Xbox / Microsoft Store e qualquer `.exe`.
- **Emuladores encontrados sozinhos:** Dolphin, Ryujinx, Eden/yuzu, Cemu, PCSX2, RPCS3, DuckStation, RetroArch, Azahar/Citra, melonDS, mGBA, PPSSPP e BizHawk. Outros entram em *Emuladores → Novo emulador* (com modelos prontos de Xemu, Xenia, Flycast, Project64, Snes9x e Redream).
- **Horas:** importa as da Steam, do GOG Galaxy e (conectando a conta) da Epic Games; nos demais jogos conta tanto abrindo pelo Lazulium quanto por fora (Epic, GOG, EA ou atalho), com sessões, gráfico da semana, desconto do tempo ausente e ajuste à mão.
- **Diário:** status (Jogando, Zerado, 100%, Pausado, Abandonado, Quero jogar), nota, datas, resenha e anotações. Jogo de console também entra e exporta em JSON ou CSV.
- **Conquistas:** Steam, RetroAchievements, marcadas à mão ou criadas por você.
- **Capas e artes:** capas e fundos chegam sozinhos sem precisar de conta; conecte o SteamGridDB se quiser escolher entre mais artes, logos e ícones.
- **Capturas:** as da Steam (`F12`), as da Xbox Game Bar e as do próprio Lazulium (`Ctrl+F12` no jogo).
- **Backup de saves** no PC (`.zip` conferido) e no Google Drive, com restauração em um clique.
- **Perfil** com fundo contínuo, painéis translúcidos, GIF ou vídeo (`WEBM`/`MP4`) de fundo e retrospectiva do ano. Vira página na internet só se você pedir.
- **Amigos (opcional):** entre com a Steam sem nova senha para ver o feed e o "Jogando agora" dos amigos em qualquer loja, receber avisos quando alguém começa a jogar, comparar bibliotecas e abrir a vitrine do perfil (com GIFs e vídeos de até 50 MB).
- **Categorias** na biblioteca, como as coleções da Steam: crie as suas, arraste os jogos para organizar e alterne entre agrupar por categoria ou plataforma.
- **Listas**, **lista de desejos** com preço em reais e outras lojas, aviso de promoção, **tempo para zerar**, **O que jogar agora** e **opções de inicialização por jogo** (com exportação `.bat`).
- **Controle** de Xbox, PlayStation, Switch Pro ou genérico em todas as telas.
- **Aparência:** temas prontos, cores, fontes e cantos (com exportação e importação).
- **Bandeja:** fechar a janela não fecha o app, para ele seguir contando as horas. Para sair, botão direito no ícone perto do relógio → **Sair**.

---

## Privacidade

A versão completa está em [docs/privacidade.md](docs/privacidade.md). O resumo:

- Tudo fica em `%APPDATA%\Lazulium`: biblioteca, conquistas em arquivo próprio, horas, diário, perfil, artes, capturas, backups e log. Tokens de login são cifrados pelo Windows.
- Os logins são nas páginas oficiais da Steam, da Epic, do SteamGridDB e do Google (e pela Web API Key do RetroAchievements). O Lazulium nunca vê sua senha.
- Não tem telemetria nem relatório de erro automático. O log só sai do PC se você mandar.
- Para buscar capas, conquistas, preços e tempo para zerar, vai o nome ou o código do jogo e, se você conectou, seu SteamID ou usuário do RetroAchievements.
- No Google Drive o app só enxerga a pasta que ele mesmo criou (*Lazulium Backups*), e só manda backup de save para lá.
- A **Conta Lazulium** é opcional: só sincroniza o que você deixar ligado (atividades, "jogando agora", resumo e vitrine do perfil), fica visível apenas para quem virou amigo por código de convite e pode ser apagada na hora em *Configurações → Contas*. Fundos animados acima de ~1,1 MB e vídeos de até 50 MB ficam em disco na VPS (`147-15-123-238.sslip.io`) e são removidos ao trocar o fundo ou apagar a conta.

---

## Perguntas frequentes

**Por que o Windows ou o antivírus reclamam?**
Falta a assinatura digital paga, então o SmartScreen não conhece o programa. Alguns antivírus fazem o mesmo com qualquer programa novo. O código está aqui para quem quiser conferir; se o antivírus apagar o arquivo, me avise.

**Preciso deixar a Steam aberta?**
Não. Jogo da Steam abre pela Steam (ela inicia sozinha), os outros abrem direto.

**Como funcionam as horas de jogos da Epic, do GOG e de outros lançadores?**
Steam e GOG Galaxy já trazem as horas que você tinha. Na Epic, conecte sua conta em *Configurações → Contas* para importar as horas anteriores; depois disso, o Lazulium passa a acompanhar automaticamente inclusive os jogos que você abrir por fora dele. Para outros jogos ou ajustes manuais, dá para editar o total na página do jogo.

**As conquistas da Steam não aparecem.**
Na Steam, em *Perfil → Editar perfil → Privacidade*, deixe **Meu perfil** e **Detalhes dos jogos** como **Público**. Depois peça para buscar de novo no *Perfil* do Lazulium.

**Fechei e ele continua aberto.**
Ele fica na bandeja para contar as horas e fazer os backups. Para sair, botão direito no ícone → **Sair**. Para mudar isso, desmarque *Minimizar para a bandeja ao fechar* em **Configurações**.

**A versão portátil guarda os dados no pendrive?**
Não, usa o mesmo `%APPDATA%\Lazulium` da instalada.

**Quanto espaço os backups ocupam?**
Até 3 GB, ajustável em **Configurações**. Passou disso, as cópias mais antigas saem primeiro; a mais nova de cada jogo sempre fica.

**Como tiro o acesso ao meu Google Drive?**
Em **Configurações**, clique em **Sair** ao lado do Google, ou remova em [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Os backups já enviados ficam na pasta *Lazulium Backups* até você apagar.

---

## Deu problema? Mande o log

Em **Configurações → Ajuda e diagnóstico → Abrir pasta de logs**, pegue o `lazulium.log` (e o `lazulium.log.old`, se tiver) e mande junto com o que você estava fazendo. O log tem erros e caminhos de pasta, como `C:\Users\SeuNome\Games\…`, mas nenhuma senha.

Para testar com calma, o [guia de teste](docs/guia-de-teste.md) tem um roteiro e um modelo de relato.

---

## Para desenvolvedores

Electron 45 + electron-vite 6, React 19, TypeScript (strict), Tailwind CSS 4, Zustand e Vitest 5, empacotado com electron-builder 26 (NSIS e portátil).

```bash
npm install
npm run dev            # ou iniciar-lazulium.bat
npm run typecheck
npm test               # suíte de testes no Vitest
npm run build:win      # instalador + portátil em dist/
npm run build:portable # apenas versão portátil em dist/
npm run icons          # regenera ícones a partir de resources/logo.png
```

- **Login do Google no build:** copie `.env.example` para `.env` e preencha o client OAuth do tipo *App para computador* (escopo `drive.file`). Sem isso o resto funciona e os backups ficam só no PC.
- **Servidor de tempo para zerar, busca e preços:** [`server/igdb-proxy/`](server/igdb-proxy/README.md).
- **Servidor social e guarda de fundos grandes:** [`server/social/`](server/social/README.md).
- **Mais documentos:** [arquitetura](ARCHITECTURE.md), [conta social](docs/conta-lazulium.md), [diretrizes para devs e agentes de IA](CLAUDE.md), [roadmap](ROADMAP.md), [novidades](CHANGELOG.md), [privacidade](docs/privacidade.md) e [como publicar uma versão](docs/publicar-1.0.md).

Licença [MIT](LICENSE) © 2026 Lazuli Fool.
