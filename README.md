<p align="center"><img src="resources/icon.png" alt="Logo do Lazulium" width="96" /></p>

# Lazulium

**Todos os seus jogos de PC num lugar só: Steam, Epic, GOG, Battle.net, EA App, Ubisoft Connect, Riot, Xbox, emuladores e jogos avulsos, com horas jogadas, conquistas, capturas e backup dos saves.**

> Versão **2.0.1** · Windows 10 e 11 (64 bits) · Grátis e de código aberto (licença MIT)

---

## O que é

O Lazulium é um lançador que fica **por cima** das lojas que você já usa. Ele encontra sozinho os jogos instalados no PC, baixa capas bonitas para todos eles e mostra tudo numa biblioteca só, que funciona com mouse, teclado ou controle.

Você não precisa largar a Steam nem nenhuma outra loja: o Lazulium abre os jogos pelos lançadores de sempre. Ele só junta tudo e guarda o seu histórico.

## Por que usar

- **Uma biblioteca para tudo.** Chega de abrir quatro lançadores para lembrar o que você tem instalado. Emuladores e jogos avulsos entram junto, com capa.
- **Horas de verdade em qualquer jogo.** As horas da Steam vêm da própria Steam; nos outros jogos, o Lazulium conta o tempo quando você joga por ele, e desconta o tempo em que você saiu do PC.
- **Seu histórico não some.** Desinstalou um jogo? As horas, conquistas e anotações continuam no Diário. Reinstalou, continua de onde parou.
- **Conquistas para todos os jogos**, inclusive de emulador (RetroAchievements).
- **Seus amigos junto.** Com a conta Lazulium (opcional, entra com a Steam), veja o que a turma está jogando agora, o que zeraram e as notas que deram, de qualquer loja.
- **Saves protegidos.** Backup automático ao fechar o jogo, com cópia opcional no seu Google Drive.
- **Sem senha e sem chave de API.** Você entra nas contas pelos sites oficiais, com um clique.
- **Seus dados ficam no seu PC.** Não tem propaganda nem rastreamento. A conta de amigos é opcional, e só vai para os amigos o que você escolher mostrar.

## Como baixar e instalar

1. Baixe o instalador na [página de downloads do Lazulium](../../releases/latest) (ou pelo link que te mandaram):

   | Arquivo | Para quem |
   |---|---|
   | **`Lazulium-Setup-2.0.1.exe`** *(recomendado)* | Instala no PC, com atalhos na Área de Trabalho e no Menu Iniciar. Não precisa ser administrador. |
   | `Lazulium-Portable-2.0.1.exe` | Não instala nada: é um arquivo só, que abre com dois cliques. Demora um pouco mais para abrir. |

2. **Se o navegador avisar** que o arquivo "não é baixado com frequência", escolha **Manter** (no Edge: **…** → **Manter** → **Mostrar mais** → **Manter mesmo assim**).

3. Abra o arquivo. **Se aparecer a tela azul "O Windows protegeu o computador"**, clique em **Mais informações** e depois em **Executar assim mesmo**.

   > Por que esse aviso? O Lazulium é um projeto independente e o instalador ainda não tem uma assinatura digital paga. O Windows mostra esse aviso para qualquer programa novo nessa situação; ele não quer dizer que o arquivo tem vírus.

4. No instalador, escolha **Apenas para mim**, confirme a pasta, clique em **Instalar** e, no fim, deixe marcado **Executar Lazulium**.

5. Na primeira vez, o Lazulium mostra os jogos que encontrou e oferece conectar suas contas. Tudo é opcional e dá para mudar depois em **Configurações**.

**Precisa de:** Windows 10 ou 11 de 64 bits e uns 300 MB livres (mais o espaço dos backups de saves, se você ligar). A internet só é necessária para capas, conquistas, preços e backup no Drive; a biblioteca e a contagem de horas funcionam sem ela.

### Atualizar

A versão instalada (Setup) verifica atualizações automaticamente e também oferece o botão **Verificar atualizações** em **Configurações → Ajuda e diagnóstico**. Se preferir atualizar manualmente, baixe o instalador da nova versão e instale por cima: seus jogos, horas e configurações continuam lá.

### Desinstalar

Em **Configurações do Windows → Aplicativos**, procure **Lazulium** e clique em **Desinstalar**. Seus dados **ficam guardados** em `%APPDATA%\Lazulium`, para o caso de você voltar. Para apagar tudo de vez, aperte `Win + R`, digite `%APPDATA%`, aperte Enter e apague a pasta **Lazulium**.

---

## Recursos

- **Biblioteca:** Steam (todas as bibliotecas e discos, inclusive os atalhos não-Steam que você colocou nela), Epic Games, GOG Galaxy, Battle.net, EA App, Ubisoft Connect, Riot Games, Xbox / Microsoft Store, emuladores e qualquer `.exe`.
- **Emuladores:** Dolphin, Ryujinx, Eden/yuzu, Cemu, PCSX2, RPCS3, DuckStation, RetroArch, Azahar/Citra, melonDS, mGBA, PPSSPP e BizHawk são encontrados sozinhos. Qualquer outro entra em *Emuladores → Novo emulador*.
- **Horas jogadas:** histórico de sessões, gráfico da semana, desconto do tempo ausente e ajuste à mão.
- **Diário:** status (Jogando, Zerado, 100%…), nota, datas, resenha e anotações; registre também jogos de console.
- **Conquistas:** Steam, RetroAchievements, marcadas à mão e criadas por você.
- **Capas e artes** do SteamGridDB, trocáveis num seletor visual.
- **Capturas de tela:** as da Steam (F12) e da Xbox Game Bar, e a captura do próprio Lazulium com **Ctrl+F12** durante o jogo.
- **Backup de saves** no PC e, se você quiser, no Google Drive, com restauração em um clique.
- **Perfil do jogador** no estilo da Steam, com retrospectiva do ano; pode virar uma página na internet se você pedir.
- **Listas**, **lista de desejos** com preço em reais e aviso de promoção, **tempo para zerar** e **O que jogar agora**.
- **Controle** (Xbox, PlayStation, Switch Pro e genéricos) em todas as telas.
- **Aparência** ajustável: temas, cores, fontes e cantos.
- **Bandeja do sistema:** ao fechar a janela o Lazulium continua contando as horas perto do relógio. Para sair de verdade, clique com o botão direito no ícone dele ali e escolha **Sair**.

---

## Privacidade

Resumo (a versão completa está em [docs/privacidade.md](docs/privacidade.md)):

- **Fica no seu PC**, em `%APPDATA%\Lazulium`: biblioteca, horas, diário, perfil, artes, capturas, backups e o log. As senhas de acesso (chaves e tokens) ficam cifradas pelo Windows.
- **Nunca pedimos sua senha.** Os logins acontecem nas páginas oficiais da Steam, do SteamGridDB, do RetroAchievements e do Google.
- **Não tem telemetria.** O Lazulium não manda estatísticas de uso nem relatórios de erro para ninguém. O log só sai do seu PC se você mesmo enviar.
- **Para buscar informações**, o app manda o mínimo necessário: o nome ou o código do jogo (para capas, conquistas, preços e tempo para zerar) e, quando você conecta, o seu SteamID ou usuário do RetroAchievements.
- **Google Drive só com o seu consentimento.** Só se você clicar em *Entrar com Google* e aceitar. O Lazulium só enxerga os arquivos que ele mesmo criou (a pasta *Lazulium Backups*) e manda para lá apenas os backups dos saves.
- **Nada é publicado sem você pedir.** O perfil só vai para a internet se você usar *Perfil → Publicar na web*.

---

## Perguntas frequentes

**O Lazulium é seguro? Por que o Windows ou o antivírus reclamam?**
O instalador não tem assinatura digital paga, então o Windows não "conhece" o programa e mostra o aviso do SmartScreen. Alguns antivírus fazem o mesmo com programas novos. O código é aberto e pode ser conferido por qualquer pessoa. Se o seu antivírus apagar o arquivo, avise a gente.

**Preciso deixar a Steam aberta?**
Não. Os jogos da Steam abrem pela Steam (ela inicia sozinha se precisar), e as horas deles vêm dela. Os demais jogos abrem direto.

**Por que as horas de um jogo da Epic ou do GOG estão zeradas?**
O Lazulium só sabe as horas da Steam. Nos outros jogos ele conta a partir de quando você joga por ele. Se você já tinha horas antes, ajuste o total na página do jogo.

**As conquistas da Steam não aparecem.**
Na Steam, abra *Perfil → Editar perfil → Privacidade* e deixe **Meu perfil** e **Detalhes dos jogos** como **Público**. Depois, em *Perfil* no Lazulium, clique para buscar de novo.

**Fechei o Lazulium e ele continua aberto.**
É de propósito: ele fica na bandeja do sistema para contar as horas e fazer os backups. Para fechar de vez, clique com o botão direito no ícone perto do relógio e escolha **Sair**. Para mudar, desmarque *Minimizar para a bandeja ao fechar* em **Configurações**.

**A versão portátil guarda os dados no pendrive?**
Não: ela usa a mesma pasta `%APPDATA%\Lazulium` da versão instalada, neste PC.

**Quanto espaço os backups de saves ocupam?**
No máximo 3 GB, e dá para mudar em **Configurações**. Passando do limite, as cópias mais antigas saem primeiro, sempre guardando a mais nova de cada jogo.

**Como tiro o acesso do Lazulium ao meu Google Drive?**
Em **Configurações**, na lista de contas, clique em **Sair** ao lado do Google. Você também pode remover em [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Os backups que já estão no Drive ficam na pasta *Lazulium Backups* até você apagar.

---

## Deu algum problema? Mande o log

1. No Lazulium, abra **Configurações** (ícone de engrenagem no canto superior direito).
2. Vá até **Ajuda e diagnóstico** e clique em **Abrir pasta de logs**.
3. Mande para quem te passou o app o arquivo **`lazulium.log`** (e o `lazulium.log.old`, se existir), junto com o que você estava fazendo.

> O log tem informações técnicas, como erros e o caminho das pastas dos jogos (por exemplo, `C:\Users\SeuNome\Games\…`). Ele não tem senhas. Se quiser, abra no Bloco de Notas antes de enviar.

Vai testar com calma? O [guia de teste](docs/guia-de-teste.md) tem um roteiro do que experimentar e um modelo de relato.

---

## Para desenvolvedores

Electron 34 + electron-vite, React 19, TypeScript (strict), Tailwind CSS 4 e Zustand. Empacotado com electron-builder (instalador NSIS e versão portátil).

```bash
npm install          # dependências
npm run dev          # app em modo desenvolvimento (ou iniciar-lazulium.bat)
npm run typecheck    # checagem de tipos
npm run build:win    # instalador + versão portátil em dist/
npm run icons        # regenera ícones e imagens do instalador a partir de resources/logo.png
```

- **Login do Google no build:** copie `.env.example` para `.env` e preencha o client OAuth do tipo *App para computador* (escopo `drive.file`). Sem ele, o resto do app funciona e os backups ficam só no PC.
- **Servidor próprio** (tempo para zerar, busca de jogos e preços): `server/igdb-proxy/`, com instruções no [README dele](server/igdb-proxy/README.md).
- **Documentos:** [arquitetura](ARCHITECTURE.md), [diretrizes para devs e agentes de IA](CLAUDE.md), [roadmap](ROADMAP.md), [novidades por versão](CHANGELOG.md), [política de privacidade](docs/privacidade.md) e [como publicar uma versão](docs/publicar-1.0.md).

Licença [MIT](LICENSE) © 2026 Lazuli Fool.
