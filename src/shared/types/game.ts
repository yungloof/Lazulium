export type GamePlatform = 'steam' | 'epic' | 'gog' | 'riot' | 'xbox' | 'emulator' | 'standalone';

export type EmulatorType = 
  | 'dolphin' 
  | 'ryujinx' 
  | 'cemu' 
  | 'pcsx2' 
  | 'rpcs3' 
  | 'duckstation' 
  | 'retroarch' 
  | 'eden' 
  | 'azahar' 
  | 'melonds' 
  | 'mgba' 
  | 'ppsspp' 
  | 'bizhawk' 
  | 'custom';

export interface GameMedia {
  coverUrl?: string; // Capa vertical (ex: 600x900)
  heroUrl?: string;  // Banner horizontal / Hero (ex: 1920x620)
  logoUrl?: string;  // Logo PNG transparente
  iconUrl?: string;  // Ícone de app
}

export type GameLogStatus = 'backlog' | 'playing' | 'paused' | 'finished' | 'completed' | 'dropped';

// Registro pessoal do jogador: nunca é alterado por scans
export interface GameLog {
  status?: GameLogStatus;
  rating?: number;                  // 1 a 5 estrelas
  startedOn?: string;               // AAAA-MM-DD
  finishedOn?: string;              // AAAA-MM-DD
  review?: string;                  // Resenha / o que achou
  notes?: string;                   // Anotações de progresso
}

// Entra no Diário quem foi registrado: status, nota, datas, resenha ou anotações (horas sozinhas não contam)
export function isJournalEntry(game: Pick<Game, 'log' | 'manualEntry'>): boolean {
  const log = game.log;
  return !!(game.manualEntry || log?.status || log?.rating || log?.startedOn || log?.finishedOn || log?.review?.trim() || log?.notes?.trim());
}

export interface Game {
  id: string;                       // UUID ou platform_id único
  title: string;                    // Nome exibido
  platform: GamePlatform;           // Origem
  platformGameId?: string;          // AppID da Steam, AppName da Epic, etc.
  
  // Execução
  executablePath: string;           // Caminho do .exe ou do emulador
  launchArguments?: string;         // Argumentos passados via CLI
  workingDirectory?: string;        // Diretório de execução
  launchUri?: string;               // Protocolo do launcher (ex: steam://rungameid/123)
  installPath?: string;             // Pasta de instalação detectada pelo scanner
  isInstalled?: boolean;            // false: desinstalado, histórico preservado (ausente = instalado)
  familyShared?: boolean;           // Steam: o dono é outra conta (Família Steam). Só se sabe com o jogo instalado.
  manualEntry?: boolean;            // Registrado à mão no Diário (ex: jogo de console); não é iniciado pelo app
  manualPlatform?: string;          // Onde jogou, em texto livre (ex: PS5, Switch)
  log?: GameLog;
  opensViaLauncher?: boolean;       // executablePath é só um lançador (Riot Client, Xbox): rastreia pela pasta do jogo

  // Específico para emuladores
  emulatorId?: EmulatorType;        // Qual emulador executa este jogo
  romPath?: string;                 // Caminho da ROM/ISO

  // SteamGridDB
  steamGridDbId?: number;           // Jogo do SteamGridDB escolhido pelo usuário (evita nova busca)
  
  // Metadados Visuais
  media: GameMedia;
  isFavorite: boolean;
  isHidden: boolean;
  tags: string[];                   // Categorias / Gêneros
  
  // Estatísticas de Uso
  totalPlaytimeSeconds: number;     // Segundos acumulados jogados
  sourcePlaytimeSeconds?: number;   // Último total informado pelo launcher (ex: localconfig da Steam)
  playtimeAdjustmentSeconds?: number; // Ajuste manual somado ao total do launcher (horas de antes de existir o registro)
  lastPlayedAt?: string;            // ISO timestamp
  createdAt: string;                // ISO timestamp
  updatedAt: string;                // ISO timestamp

  // Status de Execução em Tempo Real (runtime)
  isRunning?: boolean;
}

export interface PlaytimeSession {
  id: string;
  gameId: string;
  startedAt: string;                // ISO timestamp
  endedAt: string;                  // ISO timestamp
  durationSeconds: number;
  idleSeconds?: number;             // Tempo ausente detectado e descontado
}

export interface EmulatorProfile {
  id: EmulatorType;
  name: string;
  system: string;                   // Ex: 'Nintendo Switch', 'PlayStation 2'
  defaultExecutableNames: string[]; // Ex: ['Ryujinx.exe']
  supportedExtensions: string[];    // Ex: ['.nsp', '.xci']
  commandTemplate: string;          // Ex: '"{rom}"' ou '-b -e "{rom}"'
  defaultRomDirectories: string[];
}

// Configuração do usuário para cada emulador (persistida no banco local)
export interface EmulatorConfig {
  emulatorId: EmulatorType;
  enabled: boolean;
  executablePath?: string;          // Caminho completo do .exe do emulador
  romDirectories: string[];         // Pastas de ROMs a varrer
  corePath?: string;                // RetroArch: caminho do core (.dll) usado em {core}
  autoDetected?: boolean;           // O executável foi achado pelo app, não escolhido à mão
  dismissedRomDirectories?: string[]; // Pastas que o usuário tirou: a detecção não as traz de volta
}
