# 🎮 Guia de Teste do Lazulium (para amigos)

Oi! Muito obrigado por topar testar o **Lazulium** (nosso hub universal de jogos para PC).

Este guia rápido foi feito para você testar as principais funções do aplicativo sem complicações e nos ajudar a encontrar detalhes a ajustar antes do lançamento público.

---

## 📥 1. Qual arquivo baixar e como abrir

Você vai receber ou baixar um dos seguintes arquivos da pasta `dist/`:

| Arquivo | Para quem é | Como funciona |
|---|---|---|
| **`Lazulium-Setup-0.2.0.exe`** *(Recomendado)* | Quem quer instalar no PC normalmente | Cria atalhos na Área de Trabalho e no Menu Iniciar. Instala apenas para o seu usuário (não precisa de permissão de administrador). |
| **`Lazulium-Portable-0.2.0.exe`** | Quem prefere não instalar nada | É um único arquivo executável. Basta dar dois cliques e ele abre direto (pode rodar até de um pendrive). |

> **Nota sobre seus dados:** Pode testar com tranquilidade! Seus dados (banco em `storage`, capas e artes em `artwork`, anotações do diário e backups de saves) ficam guardados com segurança na pasta do seu usuário (`%APPDATA%\Lazulium`) e não são apagados ao trocar de versão ou desinstalar o app.

---

### 🛡️ Como passar pelo aviso do Windows SmartScreen

Como o Lazulium é um projeto independente em fase de testes e ainda não possui um certificado digital pago da Microsoft, o Windows pode exibir uma tela azul avisando que *"O Windows protegeu o seu computador"*. Isso é normal para programas novos independentes.

Para abrir:
1. Na janela azul que aparecer, clique no link **"Mais informações"** (abaixo do texto principal).
2. Em seguida, clique no botão **"Executar assim mesmo"** que vai surgir no canto inferior.
3. Pronto! O Lazulium vai iniciar normalmente.

---

## 🎯 2. O que testar (Roteiro sugerido)

Não precisa testar tudo de uma vez só. Aqui estão os recursos principais para você experimentar:

### 🌟 A. Boas-vindas e Contas
- Na primeira vez que abrir, veja se a tela de **boas-vindas** aparece mostrando quantos jogos foram encontrados no seu PC.
- Conecte a sua conta da **Steam**:
  - O Lazulium **não pede senha nem chaves de API complicadas**.
  - Se a sua Steam estiver aberta no computador, ele reconhece a conta e conecta com apenas **um clique**.
  - Se preferir outra conta, você pode entrar pelo navegador com segurança.

### 🕹️ B. Abrir um jogo e conferir as horas
1. Na sua biblioteca, clique em qualquer jogo e aperte o botão verde grande **JOGAR**.
2. Jogue por alguns minutos (ou deixe o jogo aberto um tempinho).
3. Feche o jogo e volte para a tela do Lazulium.
4. Confira se o tempo jogado foi somado corretamente no cartão do jogo e no gráfico de atividade recente.
5. *Dica:* Se tiver um controle (Xbox, PlayStation, Switch ou genérico), conecte-o e teste navegar pelo app usando o direcional e os botões!

### 🏆 C. Capturas, Conquistas e Perfil
- **Capturas de Tela:** Se você tirou screenshots pela Steam (F12) ou pela Xbox Game Bar (Win + Alt + PrtScn), veja se elas aparecem na galeria na página do jogo. Você pode clicar para ver em tela cheia!
- **Conquistas:** Veja se as suas conquistas desbloqueadas e bloqueadas da Steam aparecem corretamente com data e imagem.
- **Perfil:** Clique na aba **Perfil** na barra superior para ver o resumo unificado de todas as suas horas jogadas, seu nível da conta e a vitrine de conquistas.

### 📓 D. O Diário de Jogos (Novidade!)
O Diário é a sua linha do tempo permanente de jogos:
- Clique em **Diário** na barra superior.
- **Jogos desinstalados não somem:** Verifique se jogos da Steam que você já jogou no passado (mas que estão desinstalados agora) continuam aparecendo na lista com as horas históricas preservadas.
- **Marcar status e dar nota:** Clique em qualquer jogo para definir seu status (ex: *Jogando*, *Zerado*, *100%*, *Pausado*, *Quero jogar*), dar uma nota e escrever anotações pessoais.
- **Registrar jogo à mão:** Use o botão **"Registrar Jogo"** para cadastrar manualmente um jogo que você jogou no videogame (PlayStation, Nintendo Switch, etc.) ou em outro computador.
- **Ajustar horas de jogos fora da Steam:** Se você joga algum jogo fora da Steam e já tinha horas acumuladas nele antes, teste ajustar o tempo total para manter o histórico correto.
- **Exportar:** No topo do Diário, teste os botões de exportar em **CSV** (para abrir no Excel) ou **JSON**.

### 🧰 E. Novidades para experimentar
- **Backup de saves:** na tela de boas-vindas (ou em Configurações → Backup de saves) você escolhe se o Lazulium copia seus saves sozinho. É opcional, usa no máximo 3 GB de disco (ajustável) e, se conectar o Google Drive, também envia para lá. Teste jogar algo, fechar e ver se aparece em Configurações.
- **Capturas em tempo real:** com um jogo aberto pelo Lazulium, aperte **Ctrl+F12**. A captura aparece na galeria do jogo, e dá para copiar, abrir a pasta, mover para outro jogo ou apagar. Se a imagem sair preta, o jogo provavelmente está em tela cheia exclusiva: use o modo janela sem bordas.
- **Listas, Desejos e busca:** crie listas (no menu do jogo, **Adicionar à lista**), acompanhe preços na aba **Desejos** e aperte **Ctrl+K** para buscar qualquer jogo rápido.
- **Renomear e ocultar jogos:** botão direito no jogo.
- **Conquistas:** todos os jogos têm o mesmo destaque. Jogos de emulador usam o RetroAchievements (entre com a conta em Contas).

---

## 🪵 3. Algo deu errado? Como nos enviar o log

Se o aplicativo travar, alguma tela ficar em branco, fechar sozinho ou um jogo não contar o tempo, envie para nós o arquivo de diagnóstico (`lazulium.log`).

### Como pegar o arquivo com 2 cliques:
1. No Lazulium, clique no **ícone de engrenagem (Configurações)** no canto superior direito.
2. Na lateral esquerda, clique em **Ajuda e diagnóstico**.
3. Clique no botão **"Abrir pasta de logs"**.
4. Uma pasta do Windows vai abrir. O arquivo que precisamos se chama **`lazulium.log`**.

> ⚠️ **Aviso de privacidade:** O arquivo de log registra informações técnicas do sistema para nos ajudar a encontrar defeitos (como erros de código e versões). Ele pode conter o caminho das pastas onde seus jogos estão instalados (por exemplo, `C:\Users\SeuNome\Games\...`). Se preferir, você pode abrir o arquivo no Bloco de Notas antes de enviar para conferir o que está escrito nele.

---

## 📝 4. Modelo rápido de relato

Quando terminar o teste ou se encontrar qualquer problema, copie o modelo abaixo, preencha e nos envie (pelo WhatsApp, Discord ou onde estivermos conversando):

```text
--- RELATO DE TESTE - LAZULIUM ---
1. O que eu tentei fazer:
(Ex: Tentei conectar a Steam / Abri o jogo Elden Ring / Adicionei um jogo à mão no Diário)

2. O que eu esperava que acontecesse:
(Ex: O jogo abrir e contar 15 minutos / O Diário salvar a nota que dei)

3. O que realmente aconteceu:
(Ex: Funcionou perfeitamente / Deu uma mensagem de erro / O tempo não contou ao fechar)

4. Versão do Windows:
(Ex: Windows 11 / Windows 10)

5. Usou controle?
(Ex: Não, só mouse e teclado / Sim, controle de Xbox Series via Bluetooth / Sim, controle de PS5 no cabo)

6. Anexou o arquivo lazulium.log?
(Sim / Não)
-----------------------------------
```

Muito obrigado por nos ajudar a tornar o Lazulium cada vez melhor! 🚀
