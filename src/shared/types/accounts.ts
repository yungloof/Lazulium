export type AccountService = 'steam' | 'steamgriddb' | 'retroachievements' | 'google' | 'epic';

// Conta da Steam logada neste PC (lida do cliente da Steam, sem senha)
export interface SteamLocalAccount {
  steamId: string;
  personaName: string;
  mostRecent: boolean;
}

export interface AccountsStatus {
  steam: { connected: boolean; steamId?: string; personaName?: string; usesApiKey: boolean };
  steamgriddb: { connected: boolean };
  retroachievements: { connected: boolean; username?: string };
  epic: { connected: boolean; displayName?: string; lastImportAt?: string };   // Só para importar horas
  google: {
    connected: boolean;
    email?: string;
    available: boolean;              // Há um client OAuth (embutido no build ou manual)
  };
}
