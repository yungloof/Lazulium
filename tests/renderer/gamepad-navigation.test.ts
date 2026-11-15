import { describe, expect, it, vi } from 'vitest';
import { computeStickScrollDelta } from '../../src/renderer/src/hooks/useGamepad';
import { useUiStore } from '../../src/renderer/src/stores/useUiStore';
import { openContextMenuForElement } from '../../src/renderer/src/utils/gameActions';
import { detectGamepadFamily, getGamepadBindings } from '../../src/renderer/src/utils/gamepadGlyphs';

describe('gamepad family detection & glyphs', () => {
  it('identifica Xbox, PlayStation e Nintendo Switch pelo gamepad.id', () => {
    expect(detectGamepadFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(detectGamepadFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(detectGamepadFamily('Sony Interactive Entertainment Wireless Controller')).toBe('playstation');
    expect(detectGamepadFamily('Nintendo Switch Pro Controller (Vendor: 057e Product: 2009)')).toBe('switch');
    expect(detectGamepadFamily('Joy-Con (L+R)')).toBe('switch');
    expect(detectGamepadFamily('')).toBe('xbox');
  });

  it('devolve botões e atalhos específicos de cada controle', () => {
    const xbox = getGamepadBindings('xbox');
    expect(xbox.face.map((b) => b.keyLabel)).toEqual(['A', 'B', 'X', 'Y']);
    expect(xbox.extra.find((b) => b.id === 'context')?.keyLabel).toBe('View');

    const ps = getGamepadBindings('playstation');
    expect(ps.face.map((b) => b.shape)).toEqual(['ps-cross', 'ps-circle', 'ps-square', 'ps-triangle']);
    expect(ps.extra.find((b) => b.id === 'filters')?.keyLabel).toBe('L1 / R1');
    expect(ps.extra.find((b) => b.id === 'context')?.keyLabel).toBe('Select');

    const sw = getGamepadBindings('switch');
    expect(sw.face.map((b) => b.keyLabel)).toEqual(['B', 'A', 'Y', 'X']);
    expect(sw.extra.find((b) => b.id === 'sections')?.keyLabel).toBe('ZL / ZR');
    expect(sw.extra.find((b) => b.id === 'context')?.keyLabel).toBe('-');
  });
});

describe('right analog scroll & View context menu anchor', () => {
  it('respeita zona morta do analógico direito e escala o deslocamento', () => {
    expect(computeStickScrollDelta(0, 16)).toBe(0);
    expect(computeStickScrollDelta(0.2, 16)).toBe(0);
    expect(computeStickScrollDelta(-0.21, 16)).toBe(0);
    expect(computeStickScrollDelta(1, 16)).toBeGreaterThan(10);
    expect(computeStickScrollDelta(-0.8, 16)).toBeLessThan(0);
    expect(Math.abs(computeStickScrollDelta(1, 500))).toBeLessThanOrEqual(60);
  });

  it('ancora o menu de contexto no cartão focado', () => {
    useUiStore.getState().setContextMenu(null);
    vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 800 });
    const fakeEl = {
      getBoundingClientRect: () => ({ left: 200, top: 150, width: 180, height: 270 })
    } as unknown as HTMLElement;

    openContextMenuForElement('steam-620', fakeEl);
    expect(useUiStore.getState().contextMenu).toEqual({ gameId: 'steam-620', x: 299, y: 230 });
    vi.unstubAllGlobals();
  });
});
