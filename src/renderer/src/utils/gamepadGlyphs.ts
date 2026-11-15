export type GamepadFamily = 'xbox' | 'playstation' | 'switch';

export type ButtonShape =
  | 'ps-cross'
  | 'ps-circle'
  | 'ps-square'
  | 'ps-triangle';

export interface FaceButtonBinding {
  id: 'confirm' | 'back' | 'favorite' | 'search';
  label: string;
  keyLabel: string;
  shape?: ButtonShape;
  className: string;
}

export interface ShoulderButtonBinding {
  id: 'filters' | 'sections' | 'context' | 'settings' | 'scroll';
  label: string;
  keyLabel: string;
}

const XBOX_PATTERN = /xbox|microsoft|xinput|045e/i;
const PS_PATTERN = /dualsense|dualshock|playstation|sony|054c|ps[345]|wireless controller/i;
const SWITCH_PATTERN = /nintendo|switch|pro controller|joy-con|joycon|057e|snes|nes controller/i;

/**
 * Identifies the connected controller brand from Web Gamepad API `gamepad.id`.
 */
export function detectGamepadFamily(id?: string | null): GamepadFamily {
  const raw = id?.trim() ?? '';
  if (!raw) return 'xbox';
  if (SWITCH_PATTERN.test(raw)) return 'switch';
  if (XBOX_PATTERN.test(raw)) return 'xbox';
  if (PS_PATTERN.test(raw)) return 'playstation';
  return 'xbox';
}

export const GAMEPAD_FAMILY_LABEL: Record<GamepadFamily, string> = {
  xbox: 'Controle Xbox',
  playstation: 'Controle PlayStation',
  switch: 'Controle Nintendo Switch'
};

const FACE_BINDINGS: Record<GamepadFamily, FaceButtonBinding[]> = {
  xbox: [
    { id: 'confirm', label: 'Selecionar', keyLabel: 'A', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    { id: 'back', label: 'Voltar', keyLabel: 'B', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
    { id: 'favorite', label: 'Favoritar', keyLabel: 'X', className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
    { id: 'search', label: 'Buscar', keyLabel: 'Y', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
  ],
  playstation: [
    { id: 'confirm', label: 'Selecionar', keyLabel: 'Cruz', shape: 'ps-cross', className: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    { id: 'back', label: 'Voltar', keyLabel: 'Bolinha', shape: 'ps-circle', className: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
    { id: 'favorite', label: 'Favoritar', keyLabel: 'Quadrado', shape: 'ps-square', className: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40' },
    { id: 'search', label: 'Buscar', keyLabel: 'Triângulo', shape: 'ps-triangle', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
  ],
  // Na padronização W3C no Windows, buttons[0..3] correspondem às posições físicas inferior/direita/esquerda/superior (B/A/Y/X no Switch)
  switch: [
    { id: 'confirm', label: 'Selecionar', keyLabel: 'B', className: 'bg-slate-800 text-slate-100 border-slate-500/60' },
    { id: 'back', label: 'Voltar', keyLabel: 'A', className: 'bg-slate-800 text-rose-300 border-rose-500/45' },
    { id: 'favorite', label: 'Favoritar', keyLabel: 'Y', className: 'bg-slate-800 text-indigo-300 border-indigo-500/45' },
    { id: 'search', label: 'Buscar', keyLabel: 'X', className: 'bg-slate-800 text-amber-300 border-amber-500/45' }
  ]
};

const EXTRA_BINDINGS: Record<GamepadFamily, ShoulderButtonBinding[]> = {
  xbox: [
    { id: 'filters', label: 'Filtros', keyLabel: 'LB / RB' },
    { id: 'sections', label: 'Seções', keyLabel: 'LT / RT' },
    { id: 'context', label: 'Opções', keyLabel: 'View' },
    { id: 'settings', label: 'Configurações', keyLabel: 'Menu' },
    { id: 'scroll', label: 'Rolar', keyLabel: 'RS' }
  ],
  playstation: [
    { id: 'filters', label: 'Filtros', keyLabel: 'L1 / R1' },
    { id: 'sections', label: 'Seções', keyLabel: 'L2 / R2' },
    { id: 'context', label: 'Opções', keyLabel: 'Select' },
    { id: 'settings', label: 'Configurações', keyLabel: 'Options' },
    { id: 'scroll', label: 'Rolar', keyLabel: 'R3' }
  ],
  switch: [
    { id: 'filters', label: 'Filtros', keyLabel: 'L / R' },
    { id: 'sections', label: 'Seções', keyLabel: 'ZL / ZR' },
    { id: 'context', label: 'Opções', keyLabel: '-' },
    { id: 'settings', label: 'Configurações', keyLabel: '+' },
    { id: 'scroll', label: 'Rolar', keyLabel: 'R' }
  ]
};

export function getGamepadBindings(family: GamepadFamily): {
  face: FaceButtonBinding[];
  extra: ShoulderButtonBinding[];
} {
  return {
    face: FACE_BINDINGS[family],
    extra: EXTRA_BINDINGS[family]
  };
}
