# Novidades do Lazulium

Da versão mais nova para a mais antiga.

---

## 3.4.0 — 26 de novembro de 2026

Feed de amigos conectado à sua biblioteca, cartão de jogo/resenha para compartilhar, prévia ao vivo de tema, navegação de volta real e barra lateral recolhível.

### Novidades

- **Cartão para compartilhar.** Em *Meu registro* na página do jogo e nas suas resenhas do *Perfil*, o botão *Cartão* gera uma imagem pronta (`1200×630`) com capa, status, nota, horas jogadas e trecho da resenha nas cores do seu tema atual, para copiar direto para o Discord ou salvar em PNG.
- **Prévia ao vivo em Aparência.** A aba *Aparência* nas Configurações mostra uma miniatura interativa no topo que atualiza na hora conforme você troca tema, cores, acento ou arredondamento, além de avisar quando uma combinação fica com baixo contraste.

### Melhorias

- **Feed de Amigos rico e conectado.** As resenhas no feed agora exibem as miniaturas das imagens anexadas e permitem filtrar por *Tudo*, *Resenhas*, *Zerados* ou *Conquistas*. Se o jogo já estiver na sua biblioteca, clicar na capa ou no botão *Na biblioteca* abre direto a página dele.
- **Navegação de volta real e barra lateral recolhível.** Abrir um jogo pelo *Diário*, *Amigos*, *Listas* ou *Perfil* guarda o caminho percorrido: o botão *Voltar para ...*, `Alt+←`, `Backspace`, o botão lateral do mouse e `B` no controle levam exatamente de volta. Na *Biblioteca*, a barra lateral pode ser recolhida (`Ctrl+B` ou pelo botão no cabeçalho) para dar mais espaço às capas.
- **Busca rápida (`Ctrl+K`) expandida e Galeria unificada.** A busca rápida passa a incluir jogos cadastrados manualmente no *Diário*, suas *Listas* e atalhos para navegar entre telas e abrir Configurações. A página de *Capturas* recebeu o mesmo cabeçalho padrão das demais seções.

---

## 3.3.1 — 26 de novembro de 2026

Correção de resenhas repetidas no feed de amigos e ajustes visuais em todo o aplicativo.

### Correções

- **Resenhas e notas não duplicam mais no feed.** Editar o texto enquanto o salvamento automático envia suas alterações (ou mudar a resenha e a nota em outro momento) agora atualiza o mesmo registro no feed dos amigos em vez de criar várias cópias. Apagar uma resenha ou nota do Diário também remove o evento do feed.
- **Corte na última linha das resenhas no feed.** Em resenhas maiores no feed de amigos, a quinta linha não fica mais cortada pela metade na borda da caixa.

### Melhorias

- **Ler resenha inteira no feed.** Resenhas longas no feed de amigos agora têm o botão *Ler resenha inteira* para abrir e fechar sem precisar sair da tela.
- **Curtidas e comentários no perfil do amigo.** A aba *Atividade* do perfil de cada amigo também mostra as curtidas e comentários nas resenhas e notas, com estrelas vetoriais no lugar dos caracteres antigos.
- **Acabamento visual coerente com seu tema.** Seleção de texto e cursor acompanham a cor do tema escolhido em *Aparência*, os cartões de registro, feed e amigos passam a respeitar a cor de painel configurada, os preços na Lista de Desejos ficam alinhados em coluna e os detalhes de data e metadados ganharam melhor contraste.

---

## 3.3.0 — 21 de novembro de 2026

Resenhas com imagens, como num blog: dá para pôr capturas de tela e imagens do PC em qualquer parte do texto.

### Novidades

- **Imagens nas resenhas.** Em *Meu registro*, embaixo da resenha, *Captura de tela* mostra as capturas daquele jogo e *Imagem do PC* abre qualquer imagem do computador. A imagem entra onde o cursor estava: no começo, no meio de um parágrafo ou no fim. Também dá para colar (Ctrl+V) ou arrastar uma imagem para dentro da resenha. Até 30 imagens por resenha.
- **Arrumar as imagens.** Passe o mouse (ou o foco do controle) na imagem para subir, descer ou tirar da resenha. Cada trecho de texto entre as imagens é uma caixa própria, e o Teclado do controle escreve no trecho em que você estava.
- **Os amigos veem as imagens.** Na página do jogo, na aba *Avaliações* do Perfil e na vitrine, a resenha aparece com o começo do texto e as imagens em miniatura; *Ler mais* abre tudo na ordem, com as imagens no meio do texto. No Diário, a lista mostra quantas imagens a resenha tem.

### Melhorias

- **Parágrafos nas resenhas dos amigos.** As resenhas que aparecem na página do jogo agora mantêm os parágrafos, em vez de virar um bloco só.

### Bom saber

- As imagens ficam guardadas no seu PC, já reduzidas. Elas só vão para o servidor da conta Lazulium quando alguém vai vê-las: com *Vitrine do perfil* e *Notas e resenhas* ligadas, ou com a sincronização entre PCs ligada (aí o outro PC traz as imagens sozinho). Sem conta, ficam só no seu PC.
- Imagem tirada de todas as resenhas é apagada de vez depois de 15 dias. Desligar o compartilhamento das resenhas e a sincronização tira as imagens do servidor (elas continuam no seu PC).
- Cada conta guarda até ~15 MB de imagens de resenha (até 300). Passou disso, a resenha aparece para os amigos sem as imagens novas.
- GIF pequeno continua animado; GIF grande entra como imagem parada.
- Quem ainda não atualizou vê só o texto da resenha, sem as imagens.

---

## 3.2.0 — 20 de novembro de 2026

O Lazulium agora se atualiza sozinho, do jeito do Discord: ninguém mais precisa procurar atualização nas configurações.

### Novidades

- **Atualização sozinha ao abrir.** Ao abrir, o Lazulium procura a versão nova antes da janela. Se tiver, aparece uma janelinha com "Baixando a versão…" e a porcentagem, ele instala e abre de novo já atualizado. Com pressa, *Abrir agora e atualizar depois* abre na hora e a atualização fica para depois. Sem internet, ele abre normal.
- **Atualização na bandeja.** Com o Lazulium na bandeja e nenhum jogo aberto, a versão nova se instala sozinha e o app volta para a bandeja. Com jogo aberto ou com a janela na tela, ele nunca se reinicia por conta própria. Ele também procura versão nova a cada hora, e não mais a cada 4 horas.

### Correções

- **Jogos soltos em atalho de pasta.** O Escanear agora entra nas pastas de jogos que são atalhos de pasta do Windows (link simbólico). O Pokémon Sword do PC Recomp aparece com o nome da pasta, e não como "SwShRecomp".

### Bom saber

- Esta atualização ainda chega do jeito antigo (pelo aviso no app ou em *Configurações → Ajuda → Verificar atualizações*). Da próxima em diante, ela acontece sozinha. A versão portátil continua só avisando que tem versão nova.

---

## 3.1.2 — 20 de novembro de 2026

### Correções

- **A 3.1.1 não abria.** O instalador da 3.1.1 saiu sem uma parte do Lazulium, e o app mostrava um erro ("Cannot find module") ao abrir. Esta versão traz as mesmas correções da 3.1.1, agora completas. Se você chegou a instalar a 3.1.1, baixe o instalador da 3.1.2 e instale por cima: sua biblioteca, horas e Diário continuam lá.

---

## 3.1.1 — 20 de novembro de 2026

### Correções

- **O Lazulium percebe mais rápido quando o jogo abre e fecha.** Depois de fechar o jogo, o "Jogando agora" some em poucos segundos, e não mais depois de quase um minuto. Jogos que travam ao fechar também deixam de aparecer abertos. Jogos que trocam de programa ao abrir (o launcher que dá lugar ao jogo, ou o anticheat do Fortnite) continuam com o tempo contado certinho.
- **PARAR funciona na hora.** O botão encerra a sessão no mesmo instante e conta o tempo até o clique, mesmo quando o jogo demora para sair ou o Windows não deixa fechá-lo. Enquanto aparece INICIANDO, um botão Cancelar deixa você desistir sem esperar (mudou de ideia? É só apertar JOGAR de novo).

---

## 3.1.0 — 15 de novembro de 2026

O controle ficou bem mais completo (teclado na tela e os símbolos do seu controle), conquistas e jogos zerados ganharam comemoração, a biblioteca lembra o que você jogou neste dia em outros anos e agora dá para dar um tempo com um amigo.

### Novidades

- **Comemorações.** Conquistas novas, jogos zerados e marcas de 100% aparecem numa comemoração com capa, brilho azul, som e vibração leve do controle (ou em modo calmo, se o Windows estiver com animações reduzidas). Com um jogo em tela cheia, ela espera você fechar o jogo para aparecer. Dá para desligar em *Configurações → Comportamento*.
- **Neste dia.** A tela inicial da biblioteca mostra lembranças do mesmo dia em anos anteriores: quando você zerou um jogo, fez 100% ou jogou pela primeira vez, com captura de tela e um trecho da sua resenha quando houver. Tudo sai só dos dados do seu PC, e a seção some quando não há nada para lembrar.
- **Teclado na tela para o controle.** Ao apertar Buscar ou confirmar num campo de texto ou de resenha com o controle, um teclado com acentos em português abre na parte de baixo da janela, para digitar sem levantar do sofá.
- **O Lazulium reconhece o seu controle.** Os símbolos da barra de ajuda e da Ajuda mudam conforme o controle conectado (Xbox, PlayStation ou Switch). O botão View / Select abre o menu de opções do jogo em foco, e o analógico direito rola a página.
- **Retrospectiva em etapas.** A retrospectiva do ano, no Perfil, abre como uma história passo a passo, que dá para passar no controle (`LB`/`RB` ou equivalente). No fim vem um cartão resumido, desenhado no seu PC, para salvar como imagem sem enviar nada para fora.
- **Dar um tempo.** No perfil de um amigo, silencie a pessoa por 1 dia, 1 semana, 1 mês ou até você desfazer: o que ela faz some do seu feed e os avisos dela param, sem ela saber. Dali também dá para bloquear ou desfazer a amizade. Quem você bloqueou fica em *Amigos → Bloqueados*.
- **Som de navegação.** Ligue, desligue e ajuste o volume dos cliques de navegação em *Configurações → Comportamento*.

### Melhorias

- **Botão JOGAR azul.** O botão JOGAR passou a usar o azul vivo do Lazulium, no lugar do verde antigo.
- **Convite de amizade para uma pessoa.** Cada código de convite vale por 7 dias e para uma pessoa só. Para chamar mais alguém, gere outro código depois que a primeira pessoa entrar.
- **Amigos mais leves.** O app consulta a sua conta Lazulium menos vezes e numa pergunta só, o que deixa a aba Amigos mais rápida quando a internet está lenta.

---

## 3.0.0 — 14 de novembro de 2026

A aba Amigos ficou muito mais interativa, agora dá para montar listas junto com a turma, a vitrine do seu perfil ganhou o seu Diário e você pode sincronizar suas anotações, listas e favoritos entre PCs.

### Novidades

- **Status, como no Discord.** Escolha entre **Disponível**, **Ausente**, **Não perturbar** (pausa os avisos na área de trabalho) e **Invisível**, com opção de prazo (15 minutos, 1 hora, 8 horas, 24 horas, 3 dias ou até você mudar). Se você deixar o PC parado sem nenhum jogo aberto, seu status muda para **Ausente** sozinho.
- **Amigos na página do jogo.** Veja quais amigos já jogaram aquele jogo direto na página dele, com horas jogadas, status do Diário, nota e resenha — sempre respeitando o que cada pessoa escolheu deixar visível.
- **Conquistas lado a lado.** Na página do jogo, a barra de conquistas de cada amigo compara o progresso dele com o seu quando a lista de conquistas é a mesma. No perfil do amigo, a nova aba **Comparar** coloca os jogos que vocês dois têm lado a lado com horas, conquistas e notas.
- **Curtir e comentar.** Curta e comente as resenhas e listas dos seus amigos (no app e na vitrine do perfil) e receba avisos na aba *Amigos* quando alguém curtir, comentar no que é seu ou responder onde você comentou. Dá para ligar ou desligar esses avisos em *Configurações → Contas*.
- **Listas em grupo.** Em *Listas → Nova lista*, ative **Lista em grupo** para convidar amigos da sua conta Lazulium e montar uma lista juntos: quem participa pode adicionar, remover e reordenar jogos na mesma lista.
- **Sincronização entre PCs.** Em *Configurações → Contas*, a nova chave **Sincronizar entre PCs** (desligada por padrão) guarda uma cópia privada do seu Diário — incluindo suas anotações pessoais —, favoritos, listas e categorias na sua conta para juntar tudo ao abrir o Lazulium em outro computador. Só você acessa essa cópia, e seus amigos nunca a veem. Se você mexer no mesmo jogo nos dois PCs, vale a edição mais nova, e o que você escreveu antes de ligar a sincronização não se perde. Você pode apagar a cópia da nuvem quando quiser.
- **Diário na vitrine do perfil.** A página do perfil (vista pelos amigos no app ou publicada na web) agora traz a aba **Diário**, reunindo jogos registrados, status, datas, notas e resenhas públicas — sem nunca expor suas anotações pessoais.

---

## 2.10.0 — 14 de novembro de 2026

### Novidades

- **Mesmo jogo em lojas diferentes vira uma capa só.** Ideia do Syrea: quem tem o GTA V na Steam e na Epic (ou qualquer jogo em duas lojas) vê uma capa só, com o selo das duas lojas e as horas somadas. Na página do jogo, o cartão **Lojas** mostra as horas de cada loja e deixa escolher por onde o jogo abre; sem escolha, ele abre pela loja instalada que você jogou por último. Se o Lazulium juntar dois jogos que não são o mesmo, **Separar** volta a mostrar uma capa por loja (e *Juntar de novo*, no cartão Informações, desfaz). Favoritar e ocultar valem para todas as lojas do jogo, e o filtro de cada loja continua mostrando ele.
- **Listas no perfil dos amigos.** As suas listas e tier lists agora aparecem na página que os amigos veem e na publicada na web: as destacadas na visão geral e todas na aba **Listas**.

---

## 2.9.0 — 14 de novembro de 2026

### Novidades

- **Tier list.** Em *Listas*, **Nova tier list** cria uma tier list como no TierMaker, com as fileiras S, A, B, C e D. Os jogos que você adiciona entram em *Sem tier*. Arraste cada capa para uma fileira ou, no controle, escolha a capa e depois a fileira na barra que aparece. Clique no rótulo de uma fileira para mudar o nome e a cor, subir, descer ou apagar; também dá para criar fileiras novas. Como as outras listas, ela pode ir para o seu perfil.
- **Amigos On-line.** Na lista de amigos e no perfil de cada um, quem está com o Lazulium aberto agora aparece como **On-line**, e não mais como "visto agora há pouco".
- **Tags no perfil.** O sistema da tag *Beta tester* ganhou outras tags, com cor própria. A primeira é a **MALDITO**, em vermelho, para o Syrea, que achou todos os problemas possíveis nos jogos da Epic.

### Correções

- **Ordem das resenhas.** As resenhas do perfil (no app, na página dos amigos e na publicada na web) seguem a data que aparece em cada uma, da mais nova para a mais antiga. Antes a ordem mudava sempre que o Escanear ou as horas mexiam no jogo.
- **Capas dos cartões de lista.** Em *Listas* e no perfil, as capas ficam todas do mesmo tamanho e não saem mais para fora do cartão, em qualquer largura de janela.

---

## 2.8.3 — 14 de novembro de 2026

### Novidades

- **Jogos da conta da Epic, mesmo não instalados.** Com a conta da Epic conectada (*Configurações → Contas*), os jogos que você já jogou pela Epic entram na biblioteca como não instalados, com nome, capa e horas, como o histórico da Steam. Aparecem com *Mostrar não instalados* ou na busca, e o botão **INSTALAR** abre o launcher da Epic na instalação do jogo. Jogos da conta que você nunca abriu (os brindes semanais, por exemplo) não entram. A lista chega sozinha alguns segundos depois de abrir o app ou de clicar em Escanear.

### Correções

- **Jogos da Epic achados pela pasta voltam a abrir pelo launcher da Epic.** Na 2.8.1 eles passaram a abrir pelo executável, mas o Fortnite e outros jogos da Epic fecham na hora se não forem abertos pelo launcher. Agora, com o launcher no PC (em qualquer pasta ou disco), o jogo abre por ele; sem o launcher, pelo executável. Se o launcher disser que o jogo não está instalado, instale por ele escolhendo a pasta onde o jogo já está: o launcher costuma conferir os arquivos que já existem em vez de baixar tudo de novo.
- **Horas do Fortnite e de outros jogos com anticheat.** O tempo passa a ser contado pela pasta do jogo, e não pelo processo que abre o jogo e fecha em segundos (antes a sessão era descartada com 3 segundos).
- "Epic Online Services", um componente do launcher, não aparece mais como jogo.

Depois de atualizar, clique em **Escanear** uma vez.

---

## 2.8.2 — 14 de novembro de 2026

### Correções

- **Jogo da Epic adicionado à mão agora é reconhecido.** Se você tinha adicionado o executável de um jogo da Epic (como o Fortnite) pelo `+`, o Escanear usa esse executável para achar a pasta do jogo, mesmo bem no fundo, e o registro vira o jogo da Epic: as horas, o favorito, o registro do Diário e as conquistas vão junto, sem ficar duplicado. Também chegam as horas da conta da Epic.
- **"Procurar agora" nas pastas de jogos de PC também busca a Epic.** Antes só procurava jogos soltos e respondia 0 novos mesmo com jogos da Epic na pasta.

---

## 2.8.1 — 14 de novembro de 2026

### Correções

- **Jogos da Epic fora das pastas padrão.** Quem instala a Epic em outra pasta ou disco, move os jogos ou tem instalações que o launcher não lista ficava com a Epic vazia no Lazulium. Agora o Escanear procura a pasta `.egstore` que todo jogo da Epic tem: nas pastas de jogos que você adicionou em *Configurações → Biblioteca*, em `Games` e `Jogos` de cada disco e, em até 3 níveis, nos seus discos (sem mexer em Windows, ProgramData e afins; a busca tem limite de 5 segundos). Se o jogo não está na lista do launcher, ele abre direto pelo executável, e as horas da conta da Epic entram normalmente porque o nome interno do jogo é o mesmo.

---

## 2.8.0 — 13 de novembro de 2026

### Novidades

- **Importar do Backloggd.** Em *Diário → Importar* agora dá para trazer o seu perfil do Backloggd. Entre no seu perfil, abra a página *Games* (todos os jogos, com nota e status) e/ou *Reviews* (texto das resenhas e plataforma), salve cada uma com Ctrl+S (“Página da Web, completa”) e escolha os arquivos. Se a lista tiver mais de uma página, salve todas: elas se somam e o mesmo jogo não duplica. Os status viram: *Completed* → Zerado, *Retired* → Contínuo, *Shelved* → Pausado, *Abandoned* → Abandonado; a nota de 0,5 a 5 e a resenha vêm junto. O Backloggd não guarda horas jogadas nem datas de início e término, então esses campos ficam vazios (a data que o site mostra é a do dia em que você lançou o jogo, e quem importou tudo de uma vez ficaria com a mesma data em tudo). O Lazulium só lê os arquivos que você salvou, não acessa o Backloggd.
- Quando o mesmo jogo vem do YGP e do Backloggd, vale o do YGP.
- Dois jogos com o mesmo nome no arquivo (como o Resident Evil 4 de 2005 e o remake) agora viram dois registros, em vez de um apagar a nota do outro.

---

## 2.7.4 — 13 de novembro de 2026

### Correções

- **Datas na importação do YGP.** A aba *Avaliações* do YGP não traz as datas em que você jogou, só a da publicação da resenha, e a aba *Jogos* salva só as linhas visíveis. Por isso muitos jogos ficavam sem data. Agora, quando o arquivo não tem as datas do jogo, a data da publicação da resenha vira a data de término de quem zerou ou fez 100%. A data real do jogo, quando existe, continua valendo. Quem já importou pode importar de novo: só o que está vazio é preenchido.

---

## 2.7.3 — 13 de novembro de 2026

### Novidades

- **Avaliações no perfil dos amigos.** A página do perfil (a que o amigo vê no Lazulium e a publicada na web) ganhou a aba *Avaliações*, ao lado de *Visão geral*: todos os jogos com nota ou resenha, em formato de publicação, com o filtro *Só com resenha* e *Ler mais* nas resenhas compridas. Vale para quem tiver a 2.7.3 e a chave *Notas e resenhas* ligada em *Amigos → Privacidade*; com ela desligada, a aba não aparece.

---

## 2.7.2 — 13 de novembro de 2026

### Novidades

- **Resenhas em formato de publicação.** Cada resenha agora aparece como um post: capa ao lado, nome e data, nota em estrelas, horas, status e plataforma, e o texto com *Ler mais* e *Ler menos* para as compridas. Vale no Diário (escolhendo *Com resenha*, que vira uma lista só de resenhas) e no perfil (aba *Avaliações* e visão geral).

---

## 2.7.1 — 13 de novembro de 2026

### Novidades

- **Resenhas e notas separadas no Diário.** Um seletor novo (*Tudo*, *Com resenha*, *Só nota*) mostra só os jogos em que você escreveu uma resenha ou só os que têm nota sem texto, com a contagem de cada um. As capas com resenha ganham o selo *Resenha*.

---

## 2.7.0 — 13 de novembro de 2026

O Diário aprende a receber o que você já registrou em outros lugares, ganha um status para jogos sem fim e o perfil dos amigos vira uma página inteira.

### Novidades

- **Importar para o Diário.** Botão *Importar*, ao lado de *Exportar*. Aceita a página salva do **Your Gamer Profile** (aba *Avaliações* e/ou aba *Jogos*, com Ctrl+S) e a cópia do Diário do próprio Lazulium (`.json`). Antes de gravar, uma prévia mostra cada jogo: quem já está na biblioteca recebe o registro e quem não está vira entrada manual do Diário, com plataforma e horas. Status, nota, datas e resenha vêm junto; nota em meia estrela, inclusive. Por padrão nada que você já preencheu é sobrescrito (há uma opção para substituir). Vários arquivos se somam sem duplicar, e a janela avisa quantos jogos do perfil ainda faltam. Tudo é lido neste computador, sem acessar o site; importar não aparece como atividade no feed dos amigos.
- **Status Contínuo.** Para jogos que não acabam (multiplayer, sandbox, jogos de serviço). Funciona nos filtros, nas categorias dinâmicas e no perfil.
- **Todas as avaliações no perfil.** A aba *Avaliações* mostra também os jogos com nota e sem resenha, com um filtro *Só com resenha*.
- **Perfil do amigo em página inteira.** Em *Amigos*, abrir um amigo agora leva a uma página com a vitrine decorada por ele (e a aba *Comparar*), em vez de uma janelinha. O botão *Amigos* volta à lista.

---

## 2.6.1 — 13 de novembro de 2026

### Novidades

- **Tag de Beta tester.** Quem ajudou a testar o Lazulium desde as primeiras versões ganha a tag *Beta tester* ao lado do nome no perfil. Ela aparece também na página que os amigos veem e na publicada na web. Para começar: Lazuli e Cranel.

### Correções

- **Trocar artes sem imagens.** Quando as miniaturas do SteamGridDB não carregam (por exemplo, por bloqueio de rede, VPN ou antivírus), cada uma agora tenta a imagem inteira e, se também falhar, mostra *Sem prévia* no lugar do ícone de imagem quebrada.

---

## 2.6.0 — 13 de novembro de 2026

Sua biblioteca agora entende o catálogo: traz gênero, ano e série dos jogos, ganha categorias dinâmicas por regras, filtros combinados e importação direta das coleções da Steam.

### Novidades

- **Gênero, ano de lançamento e série por jogo.** O servidor do catálogo passa a consultar esses dados no IGDB sem precisar de conta nem chave, preenchendo a biblioteca aos poucos e na hora em que você abre um jogo. Na página do jogo, os selos de ano, série e gênero são clicáveis e filtram a biblioteca na hora.
- **Categorias dinâmicas por regras.** Em *Categorias*, além das pastas manuais por arrastar e soltar, agora você pode criar categorias dinâmicas combinando plataforma, status do Diário, gênero, série, faixa de ano, nota mínima, favoritos e instalados. Elas se atualizam sozinhas conforme sua biblioteca cresce.
- **Filtros combinados na biblioteca.** A grade ganhou seletores combináveis de plataforma, status, gênero, série e ano (décadas e anos exatos) e ordenação por lançamento mais recente. A busca também passa a encontrar jogos por gênero e série.
- **Importar coleções da Steam.** Botão *Importar da Steam* dentro de *Categorias*: lê as coleções e favoritos salvos pela Steam neste computador (sem precisar de login ou chave extra) e mescla tudo na biblioteca.

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
