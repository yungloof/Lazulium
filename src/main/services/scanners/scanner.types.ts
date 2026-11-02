import { Game, GamePlatform } from '@shared/types/game';

// Campos que um scanner descobre sozinho. Dados do usuário (favoritos,
// playtime, artes escolhidas manualmente) são preservados no merge.
export type DetectedGame = Pick<
  Game,
  | 'id'
  | 'title'
  | 'platform'
  | 'platformGameId'
  | 'executablePath'
  | 'launchArguments'
  | 'workingDirectory'
  | 'launchUri'
  | 'installPath'
  | 'opensViaLauncher'
  | 'isInstalled'
  | 'emulatorId'
  | 'romPath'
> & {
  media?: Game['media'];            // Artes padrão sugeridas pela plataforma (ex: CDN da Steam)
  initialPlaytimeSeconds?: number;   // Horas já acumuladas no launcher de origem (ex: Steam localconfig)
  lastPlayedAt?: string;             // Data da última sessão jogada registrada no launcher
};

export interface PlatformScanResult {
  games: DetectedGame[];
  warnings: string[];
}

export interface PlatformScanner {
  platform: GamePlatform;
  scan(): Promise<PlatformScanResult>;
}
