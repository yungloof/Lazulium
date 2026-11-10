# Política de privacidade do Lazulium

*Última atualização: 10 de novembro de 2026 · vale para o Lazulium 1.0.0 e posteriores*

O Lazulium é um aplicativo para Windows que reúne seus jogos de PC numa biblioteca só. Ele é feito por um desenvolvedor independente, Lazuli Fool, que responde por esta política. Contato: **yungloof06@gmail.com**.

## Em resumo

- O Lazulium roda no seu computador. **Não existe conta do Lazulium** nem servidor com os seus dados.
- **Não coletamos telemetria**: nada de estatísticas de uso, anúncios, rastreadores ou relatórios de erro automáticos.
- O app só conversa com serviços de terceiros para fazer o que você pediu (capas, conquistas, preços, backup), mandando o mínimo necessário.
- **Seu Google Drive só é usado se você conectar**, e o Lazulium só enxerga os arquivos que ele mesmo criou.
- **Nunca vendemos, alugamos nem compartilhamos** seus dados com ninguém.

## 1. O que fica no seu computador

Tudo o que o Lazulium guarda fica na pasta `%APPDATA%\Lazulium` do seu usuário do Windows:

- a biblioteca de jogos, horas jogadas e sessões, diário (status, notas, resenhas e anotações), listas, lista de desejos e o perfil que você editou;
- conquistas e informações de perfil trazidas da Steam e do RetroAchievements, guardadas para funcionar sem internet;
- capas e artes baixadas, capturas de tela feitas pelo Lazulium e os backups de saves (`.zip`);
- o arquivo de diagnóstico `lazulium.log`;
- as sessões das janelas de login do SteamGridDB e do RetroAchievements (cookies desses sites);
- as credenciais de acesso (chaves de API do SteamGridDB e do RetroAchievements, chave da Steam Web API se você a informar, token de acesso do Google), **cifradas pelo Windows** e só abertas na memória enquanto o app usa.

Desinstalar o Lazulium não apaga essa pasta, para você não perder o histórico. Para apagar tudo, apague a pasta `%APPDATA%\Lazulium`.

### O que o Lazulium lê no seu computador

Para encontrar seus jogos e contar o tempo, o app **lê** (sem alterar):

- as pastas e arquivos de configuração da Steam, Epic Games, GOG Galaxy, Riot Games, Xbox / Microsoft Store e dos emuladores, incluindo as contas da Steam que já entraram neste PC (nome público e SteamID, para o login de um clique) e as capturas da Steam e da Xbox Game Bar;
- a lista de programas abertos, só para saber quando o jogo que você abriu começou e terminou;
- **há quanto tempo** não há uso do teclado, mouse ou controle, para descontar o tempo ausente. O Lazulium não registra o que você digita nem onde clica;
- as pastas de saves dos jogos, **só se você ligar o backup** (na tela de boas-vindas ou em Configurações) ou escolher uma pasta.

A captura de tela por tecla (padrão Ctrl+F12) só funciona com um jogo aberto pelo Lazulium e só tira a foto quando você aperta a tecla. A imagem fica no seu PC.

## 2. O que sai do seu computador, e para onde

O Lazulium só se conecta a estes serviços, cada um com a própria política de privacidade:

| Serviço | Quando | O que é enviado |
|---|---|---|
| **Steam** (Valve) | Ao conectar sua conta e ao atualizar conquistas, perfil, desejos, nomes e preços | Seu SteamID (identificador público da conta) e os códigos (AppID) dos jogos. O login pelo navegador acontece no site da Steam. Se você informar uma chave da Steam Web API nas opções avançadas, ela vai junto nas consultas à Steam. |
| **SteamGridDB** | Ao buscar capas e artes | O nome ou o código Steam do jogo e a sua chave de API do SteamGridDB. |
| **RetroAchievements** | Ao buscar conquistas de jogos de emulador | Seu nome de usuário, sua chave de API do RetroAchievements e uma "impressão digital" (hash MD5) ou o nome do jogo, para reconhecê-lo. O arquivo do jogo nunca é enviado. |
| **Servidor do Lazulium** (Cloudflare Workers) | Tempo para zerar, busca de jogos ao registrar e preços em outras lojas | O nome e/ou código Steam do jogo, o texto que você digitou na busca e os códigos Steam da sua lista de desejos. **Nenhum dado que identifique você.** O servidor consulta o IGDB (Twitch) e o GG.deals com credenciais próprias e guarda as respostas por jogo (até 30 dias), sem relação com quem perguntou. A Cloudflare recebe o seu endereço IP, como qualquer site; o Lazulium o usa só para limitar abusos e não o guarda. |
| **Google** (Drive) | Só se você clicar em *Entrar com Google* | Veja a seção 3. |
| **GitHub** | Só se você usar *Perfil → Publicar na web* | A página do perfil e o arquivo com os dados públicos do perfil (nome, avatar, horas, conquistas, listas e resenhas que você escolheu mostrar), enviados para um repositório **seu**, com o seu login do Git. Fica público na internet. O seu e-mail não vai no envio. |
| **Sites de imagens** (Steam, SteamGridDB, RetroAchievements, IGDB) | Ao mostrar capas, ícones e avatares | O pedido da imagem, como em qualquer navegador. |

Links externos (lojas, perfis, páginas de ajuda) abrem no seu navegador, fora do Lazulium.

### O que nunca é enviado

- **Suas senhas.** Os logins acontecem nas páginas oficiais (Steam e Google no seu navegador; SteamGridDB e RetroAchievements numa janela com a página do próprio site). O Lazulium não lê nem guarda a senha: depois do login, ele só lê a chave de API na página de configurações do site.
- Seus saves, capturas, anotações, diário e o log, a não ser que você mesmo envie (o backup no Drive manda **só os saves**, e só se você conectou o Drive).
- Nenhum dado vai para o desenvolvedor do Lazulium. Não há estatísticas nem relatórios automáticos.

## 3. Google Drive

O Lazulium usa o Google Drive só para guardar uma cópia dos backups dos seus saves, e só se você clicar em **Entrar com Google** e aceitar na tela do próprio Google.

- **Permissões pedidas:** `openid` e `email` (para mostrar qual conta está conectada) e `drive.file`, que **só dá acesso aos arquivos criados pelo próprio Lazulium**. O app **não consegue ver nem mexer** em nenhum outro arquivo do seu Drive.
- **O que é guardado:** uma pasta *Lazulium Backups*, com uma subpasta por jogo e os backups (`.zip` com os arquivos de save, um manifesto com as pastas de origem e somas de verificação). Cada arquivo leva identificadores internos do jogo e do backup.
- **Para que é usado:** enviar os backups, listar os que existem, baixar um para restaurar e apagar os antigos (até 10 por jogo). Nada mais.
- **Onde fica a autorização:** o token de acesso fica cifrado no seu PC. Ele nunca sai do seu computador, a não ser para o próprio Google.
- **Como desconectar:** em *Configurações*, clique em **Sair** ao lado do Google (o Lazulium revoga o acesso no Google) ou remova o Lazulium em [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Os backups já enviados ficam no seu Drive até você apagá-los.

O uso e a transferência de informações recebidas das APIs do Google pelo Lazulium seguem a [Política de Dados do Usuário dos Serviços de API do Google](https://developers.google.com/terms/api-services-user-data-policy), incluindo os requisitos de Uso Limitado. Os dados do Google não são usados para anúncios, não são vendidos, não são transferidos a terceiros e não são lidos por pessoas.

## 4. O log de diagnóstico

O arquivo `lazulium.log` registra erros e eventos técnicos (versões, falhas de conexão, caminhos de pastas de jogos). Ele não tem senhas nem chaves. Fica no seu PC e só sai de lá se **você** enviar para alguém, por exemplo para pedir ajuda.

## 5. Crianças

O Lazulium não é direcionado a crianças menores de 13 anos e não coleta dados de ninguém.

## 6. Seus direitos

Como os dados ficam no seu computador, você tem controle total: pode ver, exportar (Diário e Perfil exportam em JSON/CSV) e apagar tudo a qualquer momento. Nos serviços de terceiros (Steam, Google, SteamGridDB, RetroAchievements, GitHub), os seus direitos seguem as políticas de cada um. Para dúvidas sobre esta política ou sobre a Lei Geral de Proteção de Dados (LGPD), escreva para **yungloof06@gmail.com**.

## 7. Mudanças nesta política

Se o Lazulium passar a usar dados de outro jeito, esta página será atualizada antes, com a data no topo, e a mudança aparecerá nas novidades da versão.
