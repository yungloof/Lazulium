import { CustomEmulatorDefinition, EmulatorConfig, EmulatorProfile, EmulatorType } from '../types/game';

// Emuladores que o Lazulium conhece. Cada perfil diz:
//  - defaultExecutableNames: nomes do .exe procurados nos atalhos da Steam e na busca limitada no disco
//    (emulator-detect.service), e reconhecidos em atalhos que abrem ROM (steam-scanner);
//  - supportedExtensions: arquivos que viram jogo ao varrer as pastas de ROMs (com ponto, minúsculas);
//  - commandTemplate: argumentos passados ao emulador. Marcadores: {rom} caminho completo da ROM,
//    {romname} nome sem extensão, {romdir} pasta da ROM, {core} core do RetroArch (EmulatorConfig.corePath).
// Emuladores criados pelo jogador seguem o mesmo formato (CustomEmulatorDefinition, id custom-<uuid>).

// Perfil de um emulador conhecido ou criado pelo jogador
export function resolveEmulatorProfile(config: Pick<EmulatorConfig, 'emulatorId' | 'custom'>): EmulatorProfile | undefined {
  const known = DEFAULT_EMULATOR_PROFILES[config.emulatorId];
  if (known) return known;
  if (!config.custom) return undefined;
  return {
    id: config.emulatorId,
    name: config.custom.name,
    system: config.custom.system,
    defaultExecutableNames: [],
    supportedExtensions: config.custom.extensions,
    commandTemplate: config.custom.commandTemplate
  };
}

// Pontos de partida para o formulário de novo emulador
export const CUSTOM_EMULATOR_TEMPLATES: CustomEmulatorDefinition[] = [
  { name: 'Xemu', system: 'Xbox', extensions: ['.iso'], commandTemplate: '-dvd_path "{rom}"' },
  { name: 'Xenia', system: 'Xbox 360', extensions: ['.iso', '.xex', '.zar'], commandTemplate: '"{rom}"' },
  { name: 'Flycast', system: 'Dreamcast', extensions: ['.gdi', '.cdi', '.chd', '.cue'], commandTemplate: '"{rom}"' },
  { name: 'Project64', system: 'Nintendo 64', extensions: ['.z64', '.n64', '.v64'], commandTemplate: '"{rom}"' },
  { name: 'Snes9x', system: 'Super Nintendo', extensions: ['.sfc', '.smc'], commandTemplate: '"{rom}"' },
  { name: 'Redream', system: 'Dreamcast', extensions: ['.gdi', '.cdi', '.chd'], commandTemplate: '"{rom}"' }
];

// Aceita só definições bem formadas (arquivo importado não é confiável)
export function sanitizeCustomEmulator(input: unknown): CustomEmulatorDefinition | null {
  if (!input || typeof input !== 'object') return null;
  const src = input as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = text(src.name, 60);
  const commandTemplate = text(src.commandTemplate, 300);
  const extensions = Array.isArray(src.extensions)
    ? src.extensions.filter((e): e is string => typeof e === 'string').map((e) => (e.trim().startsWith('.') ? e.trim() : '.' + e.trim()).toLowerCase()).filter((e) => /^\.[a-z0-9]{1,8}$/.test(e)).slice(0, 20)
    : [];
  if (!name || !commandTemplate || extensions.length === 0) return null;
  return { name, system: text(src.system, 60) || 'Personalizado', extensions, commandTemplate };
}

// O RetroAchievements não tem conquistas para estes consoles (Switch, Wii U, 3DS, PS3)
const WITHOUT_RETROACHIEVEMENTS: EmulatorType[] = ['ryujinx', 'eden', 'cemu', 'azahar', 'rpcs3'];

export function hasRetroAchievements(emulatorId?: EmulatorType): boolean {
  return !emulatorId || !WITHOUT_RETROACHIEVEMENTS.includes(emulatorId);
}

// A ordem é a da tela de Emuladores (db.getEmulatorConfigs). Um .exe pertence a um perfil só.
export const DEFAULT_EMULATOR_PROFILES: Record<string, EmulatorProfile> = {
  dolphin: {
    id: 'dolphin',
    name: 'Dolphin',
    system: 'GameCube / Wii',
    defaultExecutableNames: ['Dolphin.exe'],
    supportedExtensions: ['.iso', '.gcm', '.gcz', '.wbfs', '.ciso', '.rvz'],
    commandTemplate: '-b -e "{rom}"'
  },
  ryujinx: {
    id: 'ryujinx',
    name: 'Ryujinx',
    system: 'Nintendo Switch',
    defaultExecutableNames: ['Ryujinx.exe', 'Ryujinx.Ava.exe'],
    supportedExtensions: ['.nsp', '.xci', '.nca'],
    commandTemplate: '--fullscreen "{rom}"'
  },
  cemu: {
    id: 'cemu',
    name: 'Cemu',
    system: 'Wii U',
    defaultExecutableNames: ['Cemu.exe'],
    supportedExtensions: ['.wua', '.rpx', '.wud', '.wux'],
    commandTemplate: '-g "{rom}" -f'
  },
  pcsx2: {
    id: 'pcsx2',
    name: 'PCSX2',
    system: 'PlayStation 2',
    defaultExecutableNames: ['pcsx2-qt.exe', 'pcsx2-qtx64.exe', 'pcsx2-qtx64-avx2.exe', 'pcsx2.exe'],
    supportedExtensions: ['.iso', '.bin', '.chd', '.cso', '.gz'],
    commandTemplate: '-nogui -fullscreen "{rom}"'
  },
  rpcs3: {
    id: 'rpcs3',
    name: 'RPCS3',
    system: 'PlayStation 3',
    defaultExecutableNames: ['rpcs3.exe'],
    supportedExtensions: ['.bin', '.elf', '.self'],
    commandTemplate: '"{rom}" --no-gui'
  },
  duckstation: {
    id: 'duckstation',
    name: 'DuckStation',
    system: 'PlayStation 1',
    defaultExecutableNames: ['duckstation-qt-x64-ReleaseLTCG.exe', 'duckstation-nogui-x64-ReleaseLTCG.exe', 'duckstation.exe'],
    supportedExtensions: ['.chd', '.cue', '.iso', '.pbp', '.m3u'],
    commandTemplate: '-batch -fullscreen "{rom}"'
  },
  retroarch: {
    id: 'retroarch',
    name: 'RetroArch',
    system: 'Multi-Sistema Retro',
    defaultExecutableNames: ['retroarch.exe'],
    supportedExtensions: ['.zip', '.7z', '.chd', '.iso', '.nes', '.sfc', '.smc', '.gba', '.gbc', '.gb', '.bin', '.cue'],
    commandTemplate: '-L "{core}" "{rom}" -f'
  },
  eden: {
    id: 'eden',
    name: 'Eden / yuzu',
    system: 'Nintendo Switch',
    defaultExecutableNames: ['eden.exe', 'yuzu.exe', 'suyu.exe', 'citron.exe', 'sudachi.exe'],
    supportedExtensions: ['.nsp', '.xci'],
    commandTemplate: '-f -g "{rom}"'
  },
  azahar: {
    id: 'azahar',
    name: 'Azahar / Citra',
    system: 'Nintendo 3DS',
    defaultExecutableNames: ['azahar.exe', 'lime3ds.exe', 'lime3ds-gui.exe', 'citra-qt.exe'],
    supportedExtensions: ['.3ds', '.cci', '.cxi', '.3dsx'],
    commandTemplate: '-f "{rom}"'
  },
  melonds: {
    id: 'melonds',
    name: 'melonDS',
    system: 'Nintendo DS',
    defaultExecutableNames: ['melonDS.exe'],
    supportedExtensions: ['.nds', '.dsi'],
    commandTemplate: '-f "{rom}"'
  },
  mgba: {
    id: 'mgba',
    name: 'mGBA',
    system: 'Game Boy / Color / Advance',
    defaultExecutableNames: ['mGBA.exe'],
    supportedExtensions: ['.gba', '.gbc', '.gb'],
    commandTemplate: '-f "{rom}"'
  },
  ppsspp: {
    id: 'ppsspp',
    name: 'PPSSPP',
    system: 'PlayStation Portable',
    defaultExecutableNames: ['PPSSPPWindows64.exe', 'PPSSPPWindows.exe'],
    supportedExtensions: ['.iso', '.cso', '.chd', '.pbp'],
    commandTemplate: '--fullscreen "{rom}"'
  },
  bizhawk: {
    id: 'bizhawk',
    name: 'BizHawk',
    system: 'Multi-Sistema Retro',
    defaultExecutableNames: ['EmuHawk.exe'],
    supportedExtensions: ['.nes', '.sfc', '.smc', '.gb', '.gbc', '.gba', '.n64', '.z64', '.md', '.sms'],
    commandTemplate: '"{rom}" --fullscreen'
  }
};
