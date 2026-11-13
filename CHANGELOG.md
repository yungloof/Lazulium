# Novidades do Lazulium

Da versão mais nova para a mais antiga.

---

## 2.5.4 — 13 de novembro de 2026

### Correções

- **Sincronização de conquistas da Steam.** Redirecionamentos para nomes curtos (como *Portal 2* e *Team Fortress 2*) agora mantêm `?xml=1` em vez de cair na página HTML, páginas HTML de erro temporário ou de permissão não são mais confundidas com "jogo sem conquistas", jogos em cache válido não sofrem pausa de rede, erros `429` usam espera escalonada antes de desistir e as falhas passaram a registrar o motivo real no log e na tela do Perfil.
- **Menu e avisos do Perfil.** O menu `...` do Perfil agora ajusta a largura pelo conteúdo e abre alinhado à direita sem cortar os textos nem sair da janela, e os avisos de falha de sincronização do topo e do corpo da página se limpam mutuamente para não aparecerem duplicados.

---

## 2.5.3 — 13 de novembro de 2026

### Correções

- **Preços de outras lojas em listas de desejos grandes.** O proxy do GG.deals passou a respeitar o limite de subrequests por chamada do Cloudflare Workers gratuito em lotes maiores, e o app agora consulta de 20 em 20 jogos (priorizando quem ainda está sem preço e preservando os lotes já recebidos caso bata cota momentânea).

---

## 2.5.2 — 13 de novembro de 2026

### Melhorias

- **Marca limpa na janela.** O rótulo "Steam 2" saiu da barra do topo e do título da janela; o app agora usa apenas **Lazulium**.
- **README atualizado.** Documentação principal revisada com a aba Amigos, categorias na biblioteca, importação de horas da Epic, capas automáticas, fundo animado no perfil e comandos atuais do projeto.

---

## 2.5.1 — 13 de novembro de 2026

### Melhorias

- **Fundo do perfil por inteiro.** O fundo não escurece mais para baixo nem nas bordas. Ele aparece com a mesma força do alto ao fim da página e fica parado enquanto você rola.
- **Perfil e fundo como uma coisa só.** Com um fundo escolhido, os painéis do perfil ficam translúcidos e sem borda, e a arte passa por trás deles.
- **Amigos veem o mesmo visual.** A página que abre quando alguém vê seu perfil na aba Amigos (e a publicada na web) ganhou o mesmo fundo contínuo e os mesmos painéis.
- **GIF e vídeo de fundo animados para os amigos.** Em *Editar perfil → Fundo → Imagem, GIF ou vídeo meu*, GIFs e vídeos (`WEBM` e `MP4`) de até 50 MB agora chegam animados a quem abre seu perfil (GIFs de até ~1 MB vão pelo servidor social; GIFs maiores e vídeos ficam na guarda de arquivos da VPS).

### Bom saber

- **Acima de 50 MB.** Vídeos maiores (o app aceita até 200 MB) continuam aparecendo só no seu PC; na vitrine para os amigos, o perfil fica sem o fundo personalizado.

---

## 2.5.0 — 13 de novembro de 2026

### Melhorias

- **Biblioteca mais leve no disco.** As conquistas passaram para um arquivo só delas. O arquivo da biblioteca ficou bem menor (num PC com 270 jogos, de 5 MB para menos de 1 MB) e não é mais regravado inteiro a cada conquista sincronizada. A conversão acontece sozinha na primeira vez que você abre esta versão.
- **Contas guardadas pelo método novo.** As chaves das suas contas continuam cifradas pelo Windows, agora pelo caminho que as próximas versões da base do app vão exigir. Você não precisa conectar nada de novo.
- **Testes automáticos antes de cada versão.** O banco, as categorias e a busca de jogos no PC passam por 64 testes antes de o instalador ser gerado.

### Bom saber

- **Voltar para uma versão anterior.** Se você fizer isso depois desta, o Lazulium busca as conquistas de novo e pode pedir para conectar as contas outra vez.

---

## 2.4.0 — 12 de novembro de 2026

### Novidades

- **Categorias na biblioteca.** Crie as suas (Multiplayer, Zelda, Para zerar…) e a lista lateral passa a se organizar por elas, com o resto em *Sem categoria*. Um jogo pode ficar em várias.
- **Arraste para organizar.** Solte um jogo da lista, ou uma capa da grade, em cima de uma categoria. Para tirar, arraste de volta para *Sem categoria*. Também dá pelo botão direito do jogo, em *Categorias*.
- **Você escolhe como agrupar.** O seletor *Categorias / Plataformas* fica em cima da lista lateral. O ícone ao lado abre a janela para criar, renomear, ordenar e apagar categorias, e para escolher vários jogos de uma vez.
- **Filtro por categoria.** As categorias entram no menu de filtro da biblioteca e no LT/RT do controle.

### Correções

- Um jogo reinstalado em outra pasta continua nas listas em que estava.

---

## 2.3.0 — 12 de novembro de 2026

### Segurança

- **Base do app atualizada.** O Lazulium agora roda no Electron 45, que ainda recebe correções de segurança. A versão anterior, 34, já não recebia. O instalador ficou um pouco maior por causa disso.

---

## 2.2.4 — 12 de novembro de 2026

### Correções

- **Aviso de conquistas escondidas que não some sozinho.** Se a Steam esconder as conquistas de algum jogo ("Detalhes do jogo" privado), o Perfil mostra quantos jogos foram e como resolver. O aviso fica lá até elas virem, não importa se você atualizou pelo menu, pelo aviso ou se o Lazulium buscou sozinho.

### Segurança

- A janela do app ficou mais fechada: roda isolada, não navega para sites de fora e recusa pedidos de câmera, microfone e localização.
- Links só abrem no navegador se forem de site (http ou https), e jogos só abrem por endereços de lojas conhecidas.
- O login pela Steam confere melhor a resposta da Steam, e a vitrine dos amigos não carrega nada de fora.

---

## 2.2.3 — 12 de novembro de 2026

### Correções

- **RetroAchievements conecta de novo.** A janela de login ficava presa na verificação "Um momento…" do site. Agora você escreve seu usuário, a página da chave abre no seu navegador, você copia a Web API Key e o Lazulium conecta sozinho.
- **Conquistas da Steam escondidas pela privacidade.** Se "Detalhes do jogo" estiver privado, o Perfil avisa e mostra o botão *Já mudei, buscar de novo*. O Lazulium também tenta de novo sozinho depois de algumas horas.

---

## 2.2.2 — 12 de novembro de 2026

### Correções

- Capas de jogos dos amigos que não abriam agora aparecem, inclusive dos lançamentos novos da Steam, como o PEAK.

---

## 2.2.1 — 12 de novembro de 2026

### Correções

- Jogo de amigo sem capa no feed (o Fortnite, por exemplo) agora aparece com capa. Se você tem o jogo, vai a sua; se não, a padrão.
- Textos do app e da página mais curtos e diretos.

---

## 2.2.0 — 12 de novembro de 2026

### Novidades

- **Perfil dos amigos como eles decoraram.** Avatar, fundo, arte em destaque, bio, jogos e conquistas escolhidos, nível e insígnias da Steam. A aba *Comparar* continua lá.
- **O seu vai junto.** O avatar, o fundo e a arte que você escolheu no Lazulium vão para os amigos em tamanho reduzido. Fundo em vídeo não vai; no lugar aparece o da Steam ou do jogo. Para esconder: *Configurações → Contas → Vitrine do perfil*.

---

## 2.1.0 — 11 de novembro de 2026

### Novidades

- **Horas mesmo abrindo por fora.** Abriu pela Epic, pelo GOG, pela EA ou por um atalho? Em até um minuto o Lazulium percebe e conta desde a hora em que o jogo abriu. Steam e emulador ficam de fora, porque já são contados. Desliga em *Configurações → Comportamento*.
- **Entrar com a Epic (opcional).** A Epic não guarda as horas no PC, então entrando na conta em *Configurações → Contas* o Lazulium puxa as horas de cada jogo, inclusive as antigas, e atualiza a cada 6 horas. Usa o mesmo acesso do launcher, como o Heroic e o Playnite; se a Epic mudar alguma coisa, só a importação para.
- **"Fulano começou a jogar X".** Aviso no app quando um amigo abre um jogo, ou do Windows se o Lazulium estiver minimizado. Desliga em *Configurações → Contas*.

### Correções

- Jogos de emulador, avulsos, lançamentos recentes da Steam (como PEAK) e jogos com capa escolhida no PC apareciam sem capa para os amigos.

---

## 2.0.0 — 11 de novembro de 2026

O Lazulium agora tem amigos. Entre com a Steam e veja o que a turma está jogando em qualquer loja. É opcional: sem entrar, nada sai do seu PC.

### Novidades

- **Aba Amigos**, com o que eles jogaram, zeraram, fizeram 100%, as conquistas do dia e as notas e resenhas. Vale para qualquer loja, emulador e jogo avulso.
- **Jogando agora**, no topo da aba.
- **Perfil dos amigos**: jogos, horas, zerados, conquistas e mais jogados, com selo nos que você também tem e as suas horas do lado.
- **Convite por código** de 8 letras. Quem colar vira amigo.
- **Conta Lazulium** em *Configurações → Contas*: entra com a Steam, sem senha nova nem e-mail. Ali você escolhe o nome que os amigos veem e o que mostrar (atividade, jogando agora, horas, conquistas, notas e resenhas).

### Privacidade

- Só amigos veem. Desligou uma chave, aquilo some do feed deles na hora.
- *Apagar conta Lazulium* tira tudo do servidor na hora; o que está no PC fica.
- A política de privacidade ganhou uma seção sobre a conta: o que vai, quem vê e por quanto tempo.

---

## 1.1.0 — 11 de novembro de 2026

### Novidades

- **Capa sem conta.** Epic, GOG, emulador e jogo avulso ganham capa e fundo sem entrar no SteamGridDB. Ele continua opcional para quem quer escolher entre mais artes, logos e ícones.
- **Novidades depois de atualizar**, na primeira abertura. Para rever: *Configurações → Ajuda → Novidades*.
- **Atualização na barra do topo**, com a porcentagem do download e um botão para reiniciar quando estiver pronta. Se você ignorar, ela instala ao fechar o app.
- **Atividade no Perfil**: jogou, zerou, fez 100%, conquistas, notas e resenhas, de qualquer loja. É o que os amigos vão ver na 2.0.

### Melhorias

- *Configurações → Contas* separado em progresso (Steam e RetroAchievements), lojas no PC, nuvem (Google Drive) e opcional (SteamGridDB).
- Boas-vindas sem o passo do SteamGridDB, já que as capas vêm sozinhas.
- A versão portátil avisa quando sai versão nova e leva ao download.

---

## 1.0.0 — 10 de novembro de 2026

A primeira versão para todo mundo. Quem testou antes é só instalar por cima.

### Novidades

- **Atualiza sozinho** na versão instalada: baixa em segundo plano e avisa quando é só reiniciar. A portátil continua sendo trocada à mão.
- **Adicionar à Steam**, no menu de qualquer jogo, cria o atalho já com as artes do Lazulium. *Remover da Steam* desfaz.
- **Battle.net, EA App (e Origin) e Ubisoft Connect** na biblioteca.
- **Horas do GOG Galaxy** importadas junto com o jogo.
- **Qualquer emulador** em *Emuladores → Novo emulador*: programa, tipos de arquivo e comando. Tem modelos de Xemu, Xenia, Flycast, Project64, Snes9x e Redream, e dá para exportar e passar para os amigos.
- **Instalador em português**, que deixa escolher a pasta.

### Melhorias

- Download menor e app mais leve para abrir.
- Blocos de carregamento no lugar de tela vazia, e telas sem nada dizem o que fazer.
- Quando um site cai, o aviso diz o que houve ("sem conexão com a Steam", "o site recebeu pedidos demais") e o app tenta de novo sozinho se for passageiro.
- O arquivo da biblioteca aguenta o antivírus segurando ele por um instante, comum logo depois de ligar o PC.
- Janelas, botões e avisos com o mesmo visual em todas as telas.

### Correções

- Lista de desejos: o que você mudava durante a atualização era desfeito no fim, e ficar sem internet podia apagar itens.
- Artes: internet caindo no meio não joga fora o que já baixou, disco cheio não deixa arquivo pela metade e um endereço de imagem estragado não impede o app de abrir.

---

## 0.2.0 — 10 de novembro de 2026

### Novidades

- **Editor de aparência** (*Configurações → Aparência*): temas prontos, cores, fontes, tamanho do texto e cantos. Dá para exportar o tema e importar o de alguém.
- **Opções de inicialização por jogo**: variáveis de ambiente, comando antes e depois e *Exportar como .bat* para abrir igual fora do Lazulium.

### Melhorias

- Backup automático de saves só com a sua permissão, perguntada nas boas-vindas. Ocupa até 3 GB (ajustável); passou disso, saem as cópias mais antigas, e a mais nova de cada jogo sempre fica.
- Os marcos do Lazulium (tipo "primeira hora jogada") não contam mais como conquista no Perfil.

---

## 0.1.0 — 9 de novembro de 2026 (versão de testes)

A primeira, só para quem topou testar.

### Novidades

- **Biblioteca** com Steam (todas as bibliotecas e os atalhos não-Steam), Epic Games, GOG Galaxy, Riot Games, Xbox / Microsoft Store, qualquer `.exe` e pastas de jogos avulsos.
- **Emuladores** achados sozinhos, com as pastas de jogos de cada um: Dolphin, Ryujinx, Eden/yuzu, Cemu, PCSX2, RPCS3, DuckStation, RetroArch, Azahar/Citra, melonDS, mGBA, PPSSPP e BizHawk.
- **Horas**: as da Steam vêm dela, até de jogo desinstalado. Os outros jogos abertos pelo Lazulium são contados, com sessões, gráfico da semana e desconto do tempo longe do PC.
- **Diário**: status (Jogando, Zerado, 100%, Pausado, Abandonado, Quero jogar), nota com meia estrela, datas, resenha e anotações. Desinstalar não apaga nada. Aceita jogo de console e exporta em JSON ou CSV.
- **Conquistas** da Steam (com raridade), do RetroAchievements (reconhecendo a ROM), marcadas à mão, marcos do Lazulium onde não tem lista e criadas por você.
- **Artes** do SteamGridDB guardadas no PC, com seletor para trocar.
- **Capturas** da Steam (F12) e da Xbox Game Bar na galeria de cada jogo, e captura própria com Ctrl+F12 em PNG.
- **Backup de saves** em `.zip` conferido, com cópia no Google Drive se quiser e restauração em um clique (os saves atuais são guardados antes).
- **Perfil** no estilo da Steam: horas de todas as lojas, conquistas raras, mais jogados, listas, resenhas, mapa de atividade e retrospectiva do ano. Vira página na internet só se você pedir.
- **Listas de jogos**, com ordem, ranking ou destaque no Perfil.
- **Lista de desejos** com preço em reais, menor preço visto, preço-alvo, aviso de promoção e outras lojas (GG.deals).
- **Tempo para zerar** (IGDB) e duração típica pelas análises da Steam, com o seu progresso.
- **O que jogar agora**, busca com Ctrl+K, renomear e ocultar, ordenar e filtrar, abrir a pasta do jogo e opções de inicialização.
- **Controle** de Xbox, PlayStation, Switch Pro ou genérico em todas as telas, com som de navegação.
- **Contas sem chave de API**: Steam em um clique, SteamGridDB e RetroAchievements pela página do site, Google pelo navegador.
- Bandeja do sistema, iniciar com o Windows, notificações, aviso de sem internet, tela de boas-vindas e log para mandar quando der problema.

### Melhorias

- Jogos da Família Steam marcados com o dono, mesmo desinstalados.
- Atalhos da Steam que abrem ROM viram jogo de emulador, com backup de saves e RetroAchievements.
- Visual novo: azul-noite com azul vivo, cantos suaves, fontes próprias e capas inteiras.
- O Perfil abre na hora mesmo com a internet travada (levava até 13 segundos).

### Correções

- Jogos da Steam que apareciam como "Nunca jogado".
- Sessões jogadas só no controle eram descontadas como ausência.
- Capas sumiam porque o Windows limpava a pasta onde ficavam.
- O controle derrubava a tela e só funcionava na grade de jogos.
- Entrar com o Google sem marcar a permissão do Drive ficava como "conectado".
- Emulador e atalho passavam pela Steam sem precisar.
- Atualizações e manuais de jogos de PS3 apareciam como jogos, e a mesma ROM aparecia duas vezes.
- Trocar um jogo para emulador perdia o histórico.
- Falha passageira da Steam fazia um jogo parecer "sem conquistas".
- Botões do visualizador de capturas não respondiam, e a lista de desejos trocava as capas.
