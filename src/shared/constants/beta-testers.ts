// Quem ajudou a testar o Lazulium nas primeiras versões ganha a tag "Beta tester" no perfil.
// A lista é de Steam IDs (steamcommunity.com/profiles/<id>): o perfil de cada pessoa carrega a tag sozinho, sem ela configurar nada.
export const BETA_TESTER_STEAM_IDS: readonly string[] = [
  '76561199042589586', // Lazuli
  '76561198819367534' // Cranel
];

export const isBetaTester = (steamId: string | undefined): boolean => !!steamId && BETA_TESTER_STEAM_IDS.includes(steamId);
