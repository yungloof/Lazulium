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
    commandTemplate: '"{rom}"',
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
    defaultExecutableNames: ['pcsx2-qtx64.exe', 'pcsx2.exe'],
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
    defaultExecutableNames: ['duckstation-qt-x64-ReleaseLTCG.exe', 'duckstation-nogui-x64-ReleaseLTCG.exe'],
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
  }
};
