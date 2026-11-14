import { ProfileTag, ProfileTagId } from '../types/profile';

// Tags ao lado do nome no perfil, dadas pelo Steam ID (steamcommunity.com/profiles/<id>): o perfil de cada
// pessoa carrega as suas sozinho, sem ela configurar nada. Aparecem também na página dos amigos e na publicada na web.
export const PROFILE_TAG_INFO: Readonly<Record<ProfileTagId, ProfileTag>> = {
  beta: { id: 'beta', label: 'Beta tester', title: 'Ajudou a testar o Lazulium desde as primeiras versões', tone: 'indigo' },
  maldito: { id: 'maldito', label: 'MALDITO', title: 'Achou todos os problemas possíveis nos jogos da Epic', tone: 'red' }
};

export const PROFILE_TAGS_BY_STEAM_ID: Readonly<Record<string, readonly ProfileTagId[]>> = {
  '76561199042589586': ['beta'], // Lazuli
  '76561198819367534': ['beta'], // Cranel
  '76561198439775293': ['maldito'] // Syrea
};

export function profileTagsFor(steamId: string | undefined): ProfileTag[] {
  if (!steamId) return [];
  return (PROFILE_TAGS_BY_STEAM_ID[steamId] ?? []).map((id) => PROFILE_TAG_INFO[id]);
}

export const isBetaTester = (steamId: string | undefined): boolean => profileTagsFor(steamId).some((tag) => tag.id === 'beta');
