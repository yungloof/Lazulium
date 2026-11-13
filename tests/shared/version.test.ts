import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '@shared/utils/version';

describe('isNewerVersion', () => {
  it('compara número a número, não como texto', () => {
    expect(isNewerVersion('1.10.0', '1.9.2')).toBe(true);
    expect(isNewerVersion('2.4.0', '2.3.9')).toBe(true);
    expect(isNewerVersion('2.3.9', '2.4.0')).toBe(false);
  });

  it('versão igual não é mais nova', () => {
    expect(isNewerVersion('2.4.0', '2.4.0')).toBe(false);
    expect(isNewerVersion('v2.4.0', '2.4')).toBe(false);
  });

  it('ignora o "v" da tag e sufixos', () => {
    expect(isNewerVersion('v3.0.0', '2.9.9')).toBe(true);
    expect(isNewerVersion('3.0.0-beta', '3.0.0')).toBe(false);
  });
});
