import { describe, expect, it } from 'vitest';
import { BETA_TESTER_STEAM_IDS, isBetaTester } from '../../src/shared/constants/beta-testers';

describe('beta testers', () => {
  it('reconhece quem está na lista pelo Steam ID', () => {
    for (const id of BETA_TESTER_STEAM_IDS) expect(isBetaTester(id)).toBe(true);
  });

  it('não dá a tag a mais ninguém, nem sem Steam conectada', () => {
    expect(isBetaTester(undefined)).toBe(false);
    expect(isBetaTester('')).toBe(false);
    expect(isBetaTester('76561190000000000')).toBe(false);
  });

  it('a lista só tem Steam IDs de 17 dígitos, sem repetição', () => {
    expect(BETA_TESTER_STEAM_IDS.every((id) => /^7656\d{13}$/.test(id))).toBe(true);
    expect(new Set(BETA_TESTER_STEAM_IDS).size).toBe(BETA_TESTER_STEAM_IDS.length);
  });
});
