export type AccountService = 'steam' | 'steamgriddb' | 'retroachievements' | 'google';

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
  google: {
    connected: boolean;
    email?: string;
    available: boolean;              // Há um client OAuth (embutido no build ou manual)
  };
}
