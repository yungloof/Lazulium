// Pasta (ou arquivos de uma pasta) que contém os saves de um jogo
export interface SaveLocation {
  path: string;                     // Caminho absoluto da pasta
  filePrefix?: string;              // Só arquivos que começam com este nome (ex: saves do RetroArch por ROM)
}

export type SaveLocationSource = 'steam-cloud' | 'heuristic' | 'emulator';

export interface SaveLocationSuggestion extends SaveLocation {
  source: SaveLocationSource;
  confidence: 'high' | 'medium';    // 'high' é adotado automaticamente no primeiro backup
  label: string;                    // Descrição curta para a UI
  fileCount: number;
  sizeBytes: number;
}

export interface GameSaveConfig {
  locations: SaveLocation[];
  autoBackup: boolean;              // Backup ao encerrar a sessão de jogo
}

export type BackupReason = 'auto' | 'manual' | 'pre-restore';

export interface BackupRecord {
  id: string;
  gameId: string;
  gameTitle: string;
  createdAt: string;                // ISO timestamp
  reason: BackupReason;
  fileCount: number;
  sizeBytes: number;                // Tamanho do .zip
  sha256: string;                   // Hash do .zip inteiro (integridade)
  contentHash: string;              // Hash dos saves em si (detecta backups sem alteração)
  localPath?: string;               // .zip em userData/backups (ausente se só existe no Drive)
  driveFileId?: string;
  driveError?: string;              // Falha no envio ao Drive (o backup local continua válido)
}

export interface BackupListResult {
  backups: BackupRecord[];          // Mais recente primeiro (locais + somente-Drive)
  driveError?: string;
  sharedWith?: string[];            // Outros jogos na mesma pasta (Ryujinx guarda todos juntos): restaurar volta os saves deles também
}

export interface BackupOverview {
  games: number;
  backups: number;
  sizeBytes: number;
  onDrive: number;
  pendingUpload: number;
  driveConnected: boolean;
  lastSweepAt?: string;
  autoEnabled: boolean;             // O jogador deixou o Lazulium procurar e copiar saves sozinho
  limitBytes: number;               // Espaço máximo das cópias neste PC
}

export interface RestoreResult {
  restoredFiles: number;
  safetyBackupId?: string;          // Backup automático dos saves atuais feito antes de restaurar
}

export interface DriveStatus {
  configured: boolean;              // Client ID do OAuth informado
  connected: boolean;               // Refresh token válido salvo
  email?: string;
}

// Evento main -> renderer para avisos de backup em segundo plano
export interface BackupEvent {
  gameId: string;
  state: 'started' | 'done' | 'error';
  record?: BackupRecord;
  message?: string;
}
