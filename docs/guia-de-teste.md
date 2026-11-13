# Guia de teste do Lazulium

Oi! Valeu por testar. Aqui tem um roteiro do que experimentar e um modelo para me mandar o que der errado. Não precisa fazer tudo, qualquer pedaço já ajuda.

---

## 1. Instalar

Baixe um destes na página de downloads do Lazulium no GitHub:

| Arquivo | |
|---|---|
| **`Lazulium-Setup-2.7.0.exe`** *(recomendado)* | Instala só para o seu usuário, sem pedir administrador, e cria os atalhos. |
| **`Lazulium-Portable-2.7.0.exe`** | Um arquivo só, sem instalar. Abre um pouco mais devagar. |

Se já testou uma versão antiga, instale por cima. Nada se perde.

O instalador não tem assinatura digital paga, então o Windows e o navegador vão estranhar:

- **Navegador** ("este arquivo não é baixado com frequência"): **Manter**. No Edge: **…** → **Manter** → **Mostrar mais** → **Manter mesmo assim**.
- **Tela azul "O Windows protegeu o computador"**: **Mais informações** → **Executar assim mesmo**.

No instalador, escolha **Apenas para mim** e siga.

Os dados ficam em `%APPDATA%\Lazulium` e não são apagados ao desinstalar ou trocar de versão.

---

## 2. O que testar

### Primeira vez e contas
- A tela de boas-vindas achou todos os seus jogos? Faltou algum?
- Conecte a **Steam**. Se ela estiver instalada, sua conta aparece para conectar com um clique, sem senha.
- Se quiser, conecte **SteamGridDB** (capas), **RetroAchievements** (conquistas de emulador) e **Google** (backup no Drive). O login é nos próprios sites.

### Jogar e contar horas
- Abra um jogo pelo Lazulium (**JOGAR** ou clique duplo na lista), jogue uns minutos e feche. As horas e o gráfico da semana mudaram?
- Tente também um jogo que abre por outro lançador (Epic, Riot, Xbox) e, se tiver, um de emulador.

### Biblioteca e controle
- **Ctrl+K** para buscar. Favorite, renomeie e oculte um jogo pelo botão direito.
- Crie uma **categoria** (ícone ao lado de *Categorias / Plataformas*, na lista lateral). Arraste um jogo para ela, tire pelo botão direito → *Categorias* e filtre a biblioteca por ela.
- Com um controle (Xbox, PlayStation, Switch ou genérico), dá para andar por todas as telas com direcional, A/B, LB/RB e LT/RT?

### Conquistas, capturas e perfil
- As conquistas da Steam aparecem com data e raridade? (O perfil da Steam precisa estar com **Detalhes dos jogos** público.)
- Com um jogo aberto pelo Lazulium, aperte **Ctrl+F12**. A captura aparece na galeria do jogo? E as da Steam (F12) e da Game Bar?
- No **Perfil**, as horas somadas, as conquistas raras e a retrospectiva do ano fazem sentido? Teste **Editar perfil**.

### Diário, listas e desejos
- No **Diário**, marque status, dê nota, escreva uma resenha e use **Registrar jogo** para um jogo de console. Exporte em CSV ou JSON e teste **Importar** com uma cópia JSON ou com a página salva do Your Gamer Profile (a prévia aparece antes de gravar).
- Crie uma lista (menu do jogo → *Adicionar à lista*).
- Em **Desejos**, os preços da sua lista da Steam aparecem? Defina um preço-alvo.

### Saves
- Com o backup ligado, jogue, feche e veja se o backup aparece em **Configurações**.
- Restaurar também vale testar: o Lazulium guarda os saves atuais antes.

### Personalizar
- **Configurações → Aparência:** mexa nas cores, fontes e cantos e exporte o tema.
- **Emuladores → Novo emulador:** cadastre um que o app não conhece (tem modelos de Xemu, Xenia, Flycast e outros) e exporte o arquivo.
- **Opções de inicialização** de um jogo: argumentos, variáveis, comando antes/depois e **Exportar como .bat**.

### Fechar e reinstalar
- Fechar a janela deixa o Lazulium na bandeja, perto do relógio. Botão direito no ícone → **Sair** fecha de vez.
- Desinstale, confira que `%APPDATA%\Lazulium` continua lá, reinstale e veja se a biblioteca voltou igual.

---

## 3. Deu errado? Mande o log

Travou, ficou tela em branco, fechou sozinho ou não contou o tempo: em **Configurações → Ajuda e diagnóstico → Abrir pasta de logs**, pegue o `lazulium.log` (e o `lazulium.log.old`, se tiver).

O log tem erros, versões e caminhos de pasta, como `C:\Users\SeuNome\Games\...`. Senha não tem nenhuma. Se quiser conferir, abre no Bloco de Notas.

---

## 4. Modelo de relato

```text
--- RELATO DE TESTE - LAZULIUM 2.7.0 ---
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

Valeu!
