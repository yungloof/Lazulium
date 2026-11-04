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

// Atalho da Steam: abrir o programa direto ou pela Steam (ausente = direto)
export type GameLaunchMode = 'direct' | 'launcher';

export type GameLogStatus = 'backlog' | 'playing' | 'paused' | 'finished' | 'completed' | 'dropped';

// Registro pessoal do jogador: nunca é alterado por scans
export interface GameLog {
  status?: GameLogStatus;
  rating?: number;                  // 0,5 a 5 estrelas, de meia em meia
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
  customTitle?: string;             // Nome escolhido pelo jogador: nenhum scan troca
  detectedTitle?: string;           // Nome que o scanner daria, para voltar ao original e reconhecer o jogo
  platform: GamePlatform;           // Origem
  platformGameId?: string;          // AppID da Steam, AppName da Epic, etc.
  
  // Execução
  executablePath: string;           // Caminho do .exe ou do emulador
  launchArguments?: string;         // Argumentos passados via CLI
  customLaunchArguments?: string;   // Escolhidos pelo jogador: valem no lugar dos detectados, e nenhum scan troca
  launchMode?: GameLaunchMode;
  workingDirectory?: string;        // Diretório de execução
  launchUri?: string;               // Protocolo do launcher (ex: steam://rungameid/123)
  installPath?: string;             // Pasta de instalação detectada pelo scanner
  isInstalled?: boolean;            // false: desinstalado, histórico preservado (ausente = instalado)
  familyShared?: boolean;           // Steam: o dono é outra conta (Família Steam). Só se sabe com o jogo instalado.
  manualEntry?: boolean;            // Registrado à mão no Diário (ex: jogo de console); não é iniciado pelo app
  manualPlatform?: string;          // Onde jogou, em texto livre (ex: PS5, Switch)
  log?: GameLog;
  autoCompletedAt?: string;         // Já marcado como 100% pelas conquistas: se o jogador mudar depois, não insiste
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
  skipSuggestions?: boolean;        // Não aparece em "O que jogar agora" (programas, jogos que não quer ver)
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

// Quanto tempo o jogo leva. IGDB: médias enviadas pelos jogadores. Reserva: estimativa pelas horas de quem recomenda na Steam.
export interface GamePlayLength {
  source: 'igdb' | 'steam-reviews';
  lowHours: number | null;          // IGDB: até os créditos. Reviews: quartil de baixo
  typicalHours: number | null;      // IGDB: com alguns extras. Reviews: mediana
  completeHours?: number | null;    // IGDB: 100%
  openEnded: boolean;               // Multiplayer ou sem fim: as horas variam demais
  sampleSize: number;               // Envios no IGDB ou reviews usadas
  matchedName?: string;             // Nome do jogo no IGDB
}

const MIN_RELIABLE_SUBMISSIONS = 5;

// Mais extras nunca levam menos tempo: fora dessa ordem, os rótulos se contradizem (Palworld: 85 h, 65 h, 88 h)
export function hasConsistentTimes(length: GamePlayLength): boolean {
  const times = [length.lowHours, length.typicalHours, length.completeHours].filter((h): h is number => !!h);
  return times.every((hours, index) => index === 0 || hours >= times[index - 1]);
}

// Média do IGDB com poucos envios ou contraditória: serve de noção, não de número exato
export function isWeakPlayLength(length: GamePlayLength): boolean {
  return length.source === 'igdb' && (length.sampleSize < MIN_RELIABLE_SUBMISSIONS || !hasConsistentTimes(length));
}

// Resultado do catálogo ao registrar um jogo (IGDB e loja da Steam)
export interface GameSearchResult {
  source: 'igdb' | 'steam';
  name: string;
  year?: number;
  coverUrl?: string;
  thumbUrl?: string;                // Imagem menor para a lista, quando a fonte tem
}

export interface CachedPlayLength {
  length: GamePlayLength | null;    // null: já se sabe que não há dados
  expiresAt: number;
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
