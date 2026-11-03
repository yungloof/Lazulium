import { EmulatorProfile } from '../types/game';

export const DEFAULT_EMULATOR_PROFILES: Record<string, EmulatorProfile> = {
  dolphin: {
    id: 'dolphin',
    name: 'Dolphin',
    system: 'GameCube / Wii',
    defaultExecutableNames: ['Dolphin.exe'],
    supportedExtensions: ['.iso', '.gcm', '.gcz', '.wbfs', '.ciso', '.rvz'],
    commandTemplate: '-b -e "{rom}"',
    defaultRomDirectories: []
  },
  ryujinx: {
    id: 'ryujinx',
    name: 'Ryujinx',
    system: 'Nintendo Switch',
    defaultExecutableNames: ['Ryujinx.exe', 'Ryujinx.Ava.exe'],
    supportedExtensions: ['.nsp', '.xci', '.nca'],
    commandTemplate: '--fullscreen "{rom}"',
    defaultRomDirectories: []
  },
  cemu: {
    id: 'cemu',
    name: 'Cemu',
    system: 'Wii U',
    defaultExecutableNames: ['Cemu.exe'],
    supportedExtensions: ['.wua', '.rpx', '.wud', '.wux'],
    commandTemplate: '-g "{rom}" -f',
    defaultRomDirectories: []
  },
  pcsx2: {
    id: 'pcsx2',
    name: 'PCSX2',
    system: 'PlayStation 2',
    defaultExecutableNames: ['pcsx2-qt.exe', 'pcsx2-qtx64.exe', 'pcsx2-qtx64-avx2.exe', 'pcsx2.exe'],
    supportedExtensions: ['.iso', '.bin', '.chd', '.cso', '.gz'],
    commandTemplate: '-nogui -fullscreen "{rom}"',
    defaultRomDirectories: []
  },
  rpcs3: {
    id: 'rpcs3',
    name: 'RPCS3',
    system: 'PlayStation 3',
    defaultExecutableNames: ['rpcs3.exe'],
    supportedExtensions: ['.bin', '.elf', '.self'],
    commandTemplate: '"{rom}" --no-gui',
    defaultRomDirectories: []
  },
  duckstation: {
    id: 'duckstation',
    name: 'DuckStation',
    system: 'PlayStation 1',
    defaultExecutableNames: ['duckstation-qt-x64-ReleaseLTCG.exe', 'duckstation-nogui-x64-ReleaseLTCG.exe', 'duckstation.exe'],
    supportedExtensions: ['.chd', '.cue', '.iso', '.pbp', '.m3u'],
    commandTemplate: '-batch -fullscreen "{rom}"',
    defaultRomDirectories: []
  },
  retroarch: {
    id: 'retroarch',
    name: 'RetroArch',
    system: 'Multi-Sistema Retro',
    defaultExecutableNames: ['retroarch.exe'],
    supportedExtensions: ['.zip', '.7z', '.chd', '.iso', '.nes', '.sfc', '.smc', '.gba', '.gbc', '.gb', '.bin', '.cue'],
    commandTemplate: '-L "{core}" "{rom}" -f',
    defaultRomDirectories: []
  },
  eden: {
    id: 'eden',
    name: 'Eden / yuzu',
    system: 'Nintendo Switch',
    defaultExecutableNames: ['eden.exe', 'yuzu.exe', 'suyu.exe', 'citron.exe', 'sudachi.exe'],
    supportedExtensions: ['.nsp', '.xci'],
    commandTemplate: '-f -g "{rom}"',
    defaultRomDirectories: []
  },
  azahar: {
    id: 'azahar',
    name: 'Azahar / Citra',
    system: 'Nintendo 3DS',
    defaultExecutableNames: ['azahar.exe', 'lime3ds.exe', 'lime3ds-gui.exe', 'citra-qt.exe'],
    supportedExtensions: ['.3ds', '.cci', '.cxi', '.3dsx'],
    commandTemplate: '-f "{rom}"',
    defaultRomDirectories: []
  },
  melonds: {
    id: 'melonds',
    name: 'melonDS',
    system: 'Nintendo DS',
    defaultExecutableNames: ['melonDS.exe'],
    supportedExtensions: ['.nds', '.dsi'],
    commandTemplate: '-f "{rom}"',
    defaultRomDirectories: []
  },
  mgba: {
    id: 'mgba',
    name: 'mGBA',
    system: 'Game Boy / Color / Advance',
    defaultExecutableNames: ['mGBA.exe'],
    supportedExtensions: ['.gba', '.gbc', '.gb'],
    commandTemplate: '-f "{rom}"',
    defaultRomDirectories: []
  },
  ppsspp: {
    id: 'ppsspp',
    name: 'PPSSPP',
    system: 'PlayStation Portable',
    defaultExecutableNames: ['PPSSPPWindows64.exe', 'PPSSPPWindows.exe'],
    supportedExtensions: ['.iso', '.cso', '.chd', '.pbp'],
    commandTemplate: '--fullscreen "{rom}"',
    defaultRomDirectories: []
  },
  bizhawk: {
    id: 'bizhawk',
    name: 'BizHawk',
    system: 'Multi-Sistema Retro',
    defaultExecutableNames: ['EmuHawk.exe'],
    supportedExtensions: ['.nes', '.sfc', '.smc', '.gb', '.gbc', '.gba', '.n64', '.z64', '.md', '.sms'],
    commandTemplate: '"{rom}" --fullscreen',
    defaultRomDirectories: []
  }
};
