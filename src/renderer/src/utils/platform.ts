import { Game, GamePlatform } from '@shared/types/game';

// Nomes das plataformas (antes cada tela tinha a sua tabela)

export const PLATFORM_SHORT: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG',
  riot: 'Riot',
  xbox: 'Xbox',
  battlenet: 'B.net',
  ea: 'EA',
  ubisoft: 'Ubi',
  emulator: 'Emu',
  standalone: 'PC'
};

export const PLATFORM_GROUP: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG Galaxy',
  riot: 'Riot Games',
  xbox: 'Xbox',
  battlenet: 'Battle.net',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  emulator: 'Emuladores',
  standalone: 'Outros PC'
};

export const PLATFORM_FULL: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG Galaxy',
  riot: 'Riot Games',
  xbox: 'Xbox / Microsoft Store',
  battlenet: 'Battle.net',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  emulator: 'Emulador',
  standalone: 'PC'
};

// Na capa: o emulador aparece pelo nome (Ryujinx, Dolphin...)
export const platformBadge = (game: Pick<Game, 'platform' | 'emulatorId'>): string =>
  game.platform === 'emulator' ? game.emulatorId || PLATFORM_SHORT.emulator : PLATFORM_SHORT[game.platform];
