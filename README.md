# 🎮 Lazulium ("Steam 2")

**Hub Universal de Jogos para PC, Emuladores, Conquistas e Nuvem.**

O **Lazulium** (codinome *Steam 2*) é um lançador e agregador universal de jogos moderno para PC, desenhado para unificar todas as suas plataformas (Steam, Epic Games, GOG, Emuladores e jogos standalone) em uma única interface rápida, bonita e compatível tanto com teclado/mouse quanto com controles de console.

---

## ✨ Recursos Principais

1. **Hub Universal:**
   - Detecção automática de jogos da **Steam**, **Epic Games Store** e **GOG Galaxy**.
   - Integração com emuladores de ponta (**Dolphin, Ryujinx, Cemu, PCSX2, RPCS3, RetroArch, DuckStation**).
   - Suporte a adicionar qualquer executável ou jogo independente manualmente.
2. **Contador de Horas Universal (Playtime Tracker):**
   - Monitoramento preciso de tempo de jogo para qualquer título (inclusive emuladores).
   - Histórico detalhado de sessões com data, horário e duração.
3. **Conquistas Unificadas:**
   - Sincronização de conquistas de PC via **Steam Web API**.
   - Sincronização de conquistas de emuladores via **RetroAchievements API**.
4. **Capas e Banners com SteamGridDB:**
   - Download automático de artes em alta definição: Grid vertical (600x900), Hero banners (1920x620), Logos em PNG transparente e Ícones.
   - Cache local otimizado para carregamento instantâneo offline.
5. **Backup Automático de Saves no Google Drive:**
   - Detecta pastas de saves e emuladores.
   - Realiza backup compactado no Google Drive assim que o jogo é fechado.
6. **Navegação com Controle:**
   - Suporte nativo a controles Xbox, PlayStation (DualShock / DualSense), Nintendo Switch Pro e genéricos.
   - Navegação espacial fluida (D-Pad e analógico) com atalhos de botões familiares.

---

## 🛠️ Arquitetura e Tecnologias

- **Runtime:** Electron + Vite (electron-vite)
- **Frontend:** React 19 + TypeScript + Tailwind CSS
- **Gerenciamento de Estado:** Zustand
- **Banco de Dados Local:** SQLite
- **Ícones:** Lucide React
- **Instalador:** `.exe` via electron-builder (NSIS)

Consulte [`ARCHITECTURE.md`](./ARCHITECTURE.md) para detalhes técnicos aprofundados e [`CLAUDE.md`](./CLAUDE.md) para diretrizes de desenvolvimento com agentes de IA.

---

## 🚀 Como Executar em Desenvolvimento

```bash
# 1. Instalar dependências
npm install

# 2. Executar em modo desenvolvimento
npm run dev

# 3. Gerar instalador executável (.exe)
npm run build:win
```

---

## 🗺️ Roadmap de Lançamento

Veja o plano de implementação em fases no arquivo [`ROADMAP.md`](./ROADMAP.md).
