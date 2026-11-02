# 🎮 Lazulium

**Hub universal de jogos para PC: todos os seus jogos, horas, conquistas, capturas e saves em um só lugar.**

O **Lazulium** (codinome *Steam 2*) junta a Steam, os jogos que você adicionou à Steam, GOG, Epic, Riot, Xbox/Microsoft Store, emuladores e jogos avulsos em uma biblioteca só, rápida e bonita, que funciona com mouse, teclado ou controle. Nenhuma chave de API é necessária: você entra com as suas contas.

> Versão **0.1.0**. Windows 10/11 (x64).

---

## ✨ Recursos

### Biblioteca universal
- Detecta sozinho os jogos instalados da **Steam** (todas as bibliotecas e discos), **GOG Galaxy**, **Epic Games**, **Riot Games** e **Xbox / Microsoft Store**.
- Importa os **jogos não-Steam que você adicionou à Steam** (emuladores, ports, jogos avulsos) com as artes personalizadas que você configurou nela; eles continuam abrindo pela Steam (Steam Input e overlay funcionam).
- Integração com emuladores (**Dolphin, Ryujinx, Cemu, PCSX2, RPCS3, DuckStation, RetroArch**) varrendo as suas pastas de ROMs.
- Adicione qualquer `.exe` ou pasta de jogos avulsos manualmente.
- Interface no estilo da Steam: lista de jogos na lateral (favoritos e um grupo por plataforma, clique duplo para jogar), página própria para cada jogo (banner, JOGAR, tempo, conquistas, capturas e atividade) e início com jogados recentemente e a grade de capas em três tamanhos.

### Horas jogadas
- Importa o tempo e a última sessão de cada jogo da Steam direto do cliente da Steam.
- Conta o tempo de **qualquer** jogo aberto pelo Lazulium (inclusive emuladores e jogos que abrem por um lançador, como Riot Client e Xbox), com histórico de sessões e gráfico dos últimos 7 dias.
- Recupera sessões se o PC ou o app fecharem no meio do jogo; ajuste manual do total para jogos fora da Steam.

### Conquistas
- **Steam:** pelo seu perfil público, com datas de desbloqueio e raridade global.
- **RetroAchievements:** para jogos de emulador, identificando a ROM pelo hash.
- Filtros, busca e funcionamento offline com a última sincronização.

### Artes
- Capas, banners, logos e ícones do **SteamGridDB** baixados automaticamente e guardados no PC; troque qualquer arte em um seletor visual.

### Capturas de tela
- Galeria por jogo com as capturas da **Steam (F12)**, inclusive dos jogos não-Steam, do **Xbox Game Bar** (Win+Alt+PrtScn) e imagens que você anexar; visualizador em tela cheia.

### Backup de saves
- Encontra as pastas de save (Steam Cloud local, Documentos/AppData, emuladores) e faz um `.zip` com verificação de integridade toda vez que você fecha o jogo.
- Cópia opcional no **Google Drive**; restauração com um clique (os saves atuais são guardados antes).

### Perfil do jogador
- Horas somando todas as plataformas, conquistas desbloqueadas, jogos 100%, vitrine das conquistas mais raras, mais jogados e favoritos.
- Exportação em JSON e uma **página web estática** (`web/profile/`) para mostrar o perfil num site.

### Contas sem chaves de API
- **Steam:** um clique na conta que já está logada no cliente da Steam (ou login pelo navegador).
- **SteamGridDB e RetroAchievements:** janela de login do próprio site; o Lazulium conecta sozinho.
- **Google Drive:** "Entrar com Google" (ver [Login do Google](#login-do-google)).

### No dia a dia
- Fica na **bandeja do sistema** ao fechar (rastreador e backups continuam), opção de **iniciar com o Windows**, notificações nativas e aviso claro quando está sem internet.
- Navegação por **controle** (Xbox, PlayStation, Switch Pro e genéricos) com sons de navegação.

---

## 📥 Instalação

Use um dos arquivos gerados em `dist/`:

| Arquivo | Para quem |
|---|---|
| `Lazulium-Setup-0.1.0.exe` | Instalador (por usuário, sem precisar de administrador), com atalhos na área de trabalho e no Menu Iniciar. |
| `Lazulium-Portable-0.1.0.exe` | Versão portátil: um único `.exe`, sem instalar. |

Os executáveis não são assinados digitalmente; na primeira execução o Windows SmartScreen pode pedir "Mais informações → Executar assim mesmo".

Os dados ficam em `%APPDATA%\Lazulium` (biblioteca, artes em cache e backups de saves) e são mantidos ao desinstalar.

---

## 🛠️ Desenvolvimento

```bash
npm install          # dependências
npm run dev          # app em modo desenvolvimento (ou iniciar-lazulium.bat)
npm run typecheck    # checagem de tipos
npm run build:win    # instalador + versão portátil em dist/
npm run icons        # regenera os ícones em resources/
```

### Login do Google

Para o botão "Entrar com Google" funcionar para todos, o build precisa de um client OAuth do projeto (feito uma vez por quem gera o instalador):

1. Em [console.cloud.google.com](https://console.cloud.google.com/apis/credentials), crie um **ID do cliente OAuth** do tipo **App para computador** e ative a **Google Drive API**.
2. Copie `.env.example` para `.env` e preencha `MAIN_VITE_GOOGLE_CLIENT_ID` e `MAIN_VITE_GOOGLE_CLIENT_SECRET`.
3. Publique a tela de permissão OAuth (o escopo `drive.file` só dá acesso aos arquivos criados pelo próprio Lazulium).
4. Rode `npm run build:win`.

Sem o `.env`, o resto do app funciona normalmente e os backups ficam só no PC.

### Página web do perfil

No app, **Perfil → Exportar** gera `lazulium-perfil.json`. Coloque-o em `web/profile/` (o arquivo é ignorado pelo git por conter seus dados) e sirva a pasta em qualquer hospedagem estática. Sem ele, a página mostra `lazulium-perfil.exemplo.json`.

### Tecnologias

- **Runtime:** Electron + electron-vite
- **Interface:** React 19, TypeScript, Tailwind CSS, Zustand, Lucide
- **Dados locais:** banco JSON (`lazulium_db.json`) com segredos cifrados pelo `safeStorage` do Electron
- **Empacotamento:** electron-builder (NSIS + portátil)

Detalhes em [`ARCHITECTURE.md`](./ARCHITECTURE.md), diretrizes para desenvolvedores e agentes de IA em [`CLAUDE.md`](./CLAUDE.md) e o histórico de fases em [`ROADMAP.md`](./ROADMAP.md).
