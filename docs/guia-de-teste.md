# Guia de teste do Lazulium 1.0 (para amigos)

Oi! Obrigado por testar o **Lazulium**, o hub de jogos para PC. Este guia mostra o que experimentar e como mandar o que você encontrar. Não precisa testar tudo: o que der já ajuda muito.

---

## 1. Baixar e instalar

Baixe um destes arquivos pelo link que você recebeu (a página de downloads do Lazulium no GitHub):

| Arquivo | Para quem | Como funciona |
|---|---|---|
| **`Lazulium-Setup-2.2.0.exe`** *(recomendado)* | Quem quer instalar normalmente | Instala só para o seu usuário (não pede administrador) e cria atalhos na Área de Trabalho e no Menu Iniciar. |
| **`Lazulium-Portable-2.2.0.exe`** | Quem prefere não instalar | Um arquivo só: dois cliques e abre. Demora um pouco mais para abrir. |

Já testou uma versão antiga? Instale por cima: seus jogos, horas e anotações continuam lá.

### Avisos do navegador e do Windows

O Lazulium é um projeto independente e o instalador ainda não tem uma assinatura digital paga. Por isso aparecem avisos de "programa desconhecido". É normal para programas novos.

- **No navegador** ("este arquivo não é baixado com frequência"): escolha **Manter**. No Edge: **…** → **Manter** → **Mostrar mais** → **Manter mesmo assim**.
- **Na tela azul "O Windows protegeu o computador"**: clique em **Mais informações** e depois em **Executar assim mesmo**.

### No instalador

1. Em "Para quem esta aplicação deve ser instalada?", escolha **Apenas para mim**.
2. Confirme a pasta e clique em **Instalar**.
3. No fim, deixe marcado **Executar Lazulium** e clique em **Concluir**.

> **Seus dados:** tudo fica em `%APPDATA%\Lazulium` (biblioteca, artes, diário, backups de saves e o log) e **não é apagado** ao desinstalar ou trocar de versão.

---

## 2. O que testar

### A. Primeira vez e contas
- A tela de **boas-vindas** mostra quantos jogos foram encontrados? Faltou algum jogo instalado?
- Conecte a **Steam**: se ela estiver instalada, a sua conta aparece para conectar com um clique. O Lazulium **nunca pede senha**.
- Se quiser, conecte também **SteamGridDB** (capas), **RetroAchievements** (conquistas de emulador) e **Google** (backup no Drive). As janelas de login são dos próprios sites.
- Escolha se quer o **backup automático de saves** (dá para mudar depois em Configurações).

### B. Jogar e contar as horas
1. Abra um jogo pelo Lazulium (botão **JOGAR** ou clique duplo na lista à esquerda).
2. Jogue alguns minutos e feche o jogo.
3. As horas e o gráfico da semana atualizaram na página do jogo?
4. Teste também um jogo que abre por outro lançador (Epic, Riot, Xbox) e, se tiver, um jogo de emulador.

### C. Biblioteca e controle
- Busque um jogo com **Ctrl+K**, favorite, renomeie e oculte (botão direito no jogo).
- Conecte um **controle** (Xbox, PlayStation, Switch ou genérico) e navegue pelas telas: direcional, A/B, LB/RB e LT/RT.

### D. Conquistas, capturas e Perfil
- **Conquistas:** as da Steam aparecem com data e raridade? (Precisam do perfil da Steam com **Detalhes dos jogos** público.)
- **Capturas:** com um jogo aberto pelo Lazulium, aperte **Ctrl+F12**. A imagem aparece na galeria do jogo? As da Steam (F12) e da Xbox Game Bar também aparecem?
- **Perfil:** confira as horas somadas, as conquistas raras e a retrospectiva do ano; teste **Editar perfil**.

### E. Diário, listas e desejos
- No **Diário**, marque status, dê nota, escreva uma resenha e registre um jogo de console com **Registrar jogo**. Teste exportar em CSV ou JSON.
- Crie uma **lista** (menu do jogo → *Adicionar à lista*).
- Em **Desejos**, confira os preços da sua lista de desejos da Steam e defina um preço-alvo.

### F. Saves
- Com o backup ligado, jogue algo, feche e veja se o backup aparece em **Configurações**.
- Se tiver coragem: restaure um backup (o Lazulium guarda os saves atuais antes de restaurar).

### G. Personalizar
- **Configurações → Aparência:** cores, fontes, cantos; exporte o seu tema.
- **Emuladores → Novo emulador:** cadastre um emulador que o app não conhece (há modelos de Xemu, Xenia, Flycast e outros) e exporte o arquivo para trocar com amigos.
- **Opções de inicialização** de um jogo: argumentos, variáveis, comando antes/depois e **Exportar como .bat**.

### H. Fechar, desinstalar e reinstalar
- Feche a janela: o Lazulium continua na bandeja, perto do relógio. Clique com o botão direito no ícone e escolha **Sair** para fechar de vez.
- Desinstale em **Configurações do Windows → Aplicativos**, confira que a pasta `%APPDATA%\Lazulium` continua lá, reinstale e veja se a biblioteca voltou igual.

---

## 3. Algo deu errado? Mande o log

Se o app travar, uma tela ficar em branco, fechar sozinho ou um jogo não contar o tempo, mande o arquivo de diagnóstico:

1. No Lazulium, abra **Configurações** (ícone de engrenagem no canto superior direito).
2. Vá até **Ajuda e diagnóstico** e clique em **Abrir pasta de logs**.
3. Na pasta que abrir, pegue o **`lazulium.log`** (e o `lazulium.log.old`, se existir).

> ⚠️ **Privacidade:** o log tem informações técnicas, como erros, versões e o caminho das pastas dos seus jogos (por exemplo `C:\Users\SeuNome\Games\...`). Ele não tem senhas. Se quiser, abra no Bloco de Notas antes de enviar.

---

## 4. Modelo de relato

Copie, preencha e mande por onde a gente conversa:

```text
--- RELATO DE TESTE - LAZULIUM 2.2.0 ---
1. O que eu tentei fazer:
(Ex: conectar a Steam / abrir o Elden Ring / registrar um jogo no Diário)

2. O que eu esperava:
(Ex: o jogo abrir e contar 15 minutos)

3. O que aconteceu:
(Ex: funcionou / apareceu uma mensagem de erro / o tempo não contou)

4. Instalador ou versão portátil?

5. Windows 10 ou 11?

6. Usou controle? Qual?
(Ex: não / controle de Xbox Series por Bluetooth / DualSense no cabo)

7. Anexou o lazulium.log? (sim / não)
-----------------------------------------
```

Valeu demais pela ajuda! 🎮
