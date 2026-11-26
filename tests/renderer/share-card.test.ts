import { describe, expect, it } from 'vitest';
import { wrapCardText } from '../../src/renderer/src/utils/shareCard';
import { contrastRatio, resolvePreviewColors } from '../../src/renderer/src/utils/theme';

const fakeCtx = (charWidth = 10) => ({
  measureText: (text: string) => ({ width: text.length * charWidth } as TextMetrics)
});

describe('shareCard wrapCardText', () => {
  it('quebra parágrafos em múltiplas linhas e adiciona reticências quando excede o limite', () => {
    const ctx = fakeCtx(10);
    const lines = wrapCardText(
      ctx,
      'Combate excelente e trilha sonora memorável do início ao fim.\n\nVale cada hora jogada.',
      180,
      3
    );

    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
    for (const line of lines) {
      expect(line.length * 10).toBeLessThanOrEqual(180);
    }
  });

  it('retorna lista vazia para texto vazio', () => {
    expect(wrapCardText(fakeCtx(), '   \n\n  ', 200, 4)).toEqual([]);
  });
});

describe('theme contrastRatio & resolvePreviewColors', () => {
  it('calcula contraste alto para tema padrão e baixo para cores próximas', () => {
    const defaultColors = resolvePreviewColors({});
    const good = contrastRatio(defaultColors.textMain, defaultColors.panel);
    expect(good).not.toBeNull();
    expect(good!).toBeGreaterThan(8);

    const lowColors = resolvePreviewColors({ bg: '#222222', panel: '#262626', textMain: '#383838' });
    const bad = contrastRatio(lowColors.textMain, lowColors.panel);
    expect(bad).not.toBeNull();
    expect(bad!).toBeLessThan(2);
  });
});
