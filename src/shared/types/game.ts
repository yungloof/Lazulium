export type GamePlatform = 'steam' | 'epic' | 'gog' | 'riot' | 'xbox' | 'emulator' | 'standalone';

export type EmulatorType = 
  | 'dolphin' 
  | 'ryujinx' 
  | 'cemu' 
  | 'pcsx2' 
  | 'rpcs3' 
  | 'duckstation' 
  | 'retroarch' 
  | 'custom';

export interface GameMedia {
  coverUrl?: string; // Capa vertical (ex: 600x900)
  heroUrl?: string;  // Banner horizontal / Hero (ex: 1920x620)
  logoUrl?: string;  // Logo PNG transparente
  iconUrl?: string;  // Ícone de app
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
}
