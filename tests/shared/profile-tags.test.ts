import { describe, expect, it } from 'vitest';
import { PROFILE_TAG_INFO, PROFILE_TAGS_BY_STEAM_ID, isBetaTester, profileTagsFor } from '../../src/shared/constants/profile-tags';

describe('tags do perfil', () => {
  it('cada Steam ID da lista recebe as suas tags, na ordem', () => {
    for (const [id, tags] of Object.entries(PROFILE_TAGS_BY_STEAM_ID)) expect(profileTagsFor(id).map((t) => t.id)).toEqual(tags);
    expect(isBetaTester('76561199042589586')).toBe(true);
    expect(profileTagsFor('76561198439775293')).toEqual([PROFILE_TAG_INFO.maldito]);
    expect(isBetaTester('76561198439775293')).toBe(false);
  });

  it('não dá tag a mais ninguém, nem sem Steam conectada', () => {
    expect(profileTagsFor(undefined)).toEqual([]);
    expect(profileTagsFor('')).toEqual([]);
    expect(profileTagsFor('76561190000000000')).toEqual([]);
    expect(isBetaTester(undefined)).toBe(false);
  });

  it('a lista só tem Steam IDs de 17 dígitos e tags que existem, sem repetição', () => {
    for (const [id, tags] of Object.entries(PROFILE_TAGS_BY_STEAM_ID)) {
      expect(id).toMatch(/^7656\d{13}$/);
      expect(new Set(tags).size).toBe(tags.length);
      for (const tag of tags) expect(PROFILE_TAG_INFO[tag]).toBeDefined();
    }
  });
});
