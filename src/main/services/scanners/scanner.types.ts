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
  | 'emulatorId'
  | 'romPath'
> & {
  media?: Game['media'];            // Artes padrão sugeridas pela plataforma (ex: CDN da Steam)
};

export interface PlatformScanResult {
  games: DetectedGame[];
  warnings: string[];
}

export interface PlatformScanner {
  platform: GamePlatform;
  scan(): Promise<PlatformScanResult>;
}
