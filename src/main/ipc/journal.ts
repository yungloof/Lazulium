import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { GameLog } from '@shared/types/game';
import { JournalEntryInput } from '@shared/types/ipc';
import { JournalImportItem, JournalImportOptions } from '@shared/types/journal-import';
import { artworkService } from '../services/metadata/artwork.service';
import { gameMetadataService } from '../services/metadata/game-metadata.service';
import { playLengthService } from '../services/metadata/play-length.service';
import { searchGameCatalog } from '../services/metadata/game-search.service';
import { socialService } from '../services/social/social.service';
import { librarySyncService } from '../services/social/sync.service';
import { addJournalEntry, journalToCsv, journalToJson, renameGame, setGameLog } from '../services/profile/journal.service';
import { applyJournalImport, previewJournalImport } from '../services/profile/journal-import.service';
import { reviewImagesService } from '../services/profile/review-images.service';
import { dialogParent, handle, saveTextAs } from './helpers';

// Diário: registro do jogador, jogos registrados à mão e exportação
export function registerJournalHandlers(): void {
  handle(IPC_CHANNELS.GAME_SET_LOG, (_event, gameId: string, log: GameLog) => {
    const game = setGameLog(gameId, log);
    socialService.scheduleSync();
    return game;
  });

  handle(IPC_CHANNELS.JOURNAL_ADD_ENTRY, (_event, entry: JournalEntryInput) => {
    const game = addJournalEntry(entry);
    socialService.scheduleSync();
    artworkService.enqueueMissing([game.id]);
    gameMetadataService.enqueueMissing([game.id]);
    return game;
  });

  handle(IPC_CHANNELS.JOURNAL_IMPORT_PREVIEW, (_event, items: JournalImportItem[], options: JournalImportOptions) =>
    previewJournalImport(items, options)
  );

  handle(IPC_CHANNELS.JOURNAL_IMPORT_APPLY, (_event, items: JournalImportItem[], options: JournalImportOptions) => {
    const result = applyJournalImport(items, options);
    if (result.games.length > 0) {
      socialService.scheduleSync();
      const created = result.games.filter((g) => g.manualEntry).map((g) => g.id);
      artworkService.enqueueMissing(created);
      gameMetadataService.enqueueMissing(created);
    }
    return result;
  });

  handle(IPC_CHANNELS.JOURNAL_SEARCH_CATALOG, (_event, query: string) => searchGameCatalog(query));

  // Imagens da resenha: o main lê o arquivo (do PC ou uma captura), a tela reduz e devolve para guardar
  handle(IPC_CHANNELS.REVIEW_IMAGE_PICK_FILE, (event) => reviewImagesService.pickFromPc(dialogParent(event)));
  handle(IPC_CHANNELS.REVIEW_IMAGE_READ_SCREENSHOT, (_event, gameId: string, screenshotId: string) => {
    if (typeof gameId !== 'string' || typeof screenshotId !== 'string') throw new Error('Captura inválida.');
    return reviewImagesService.readScreenshot(gameId, screenshotId);
  });
  handle(IPC_CHANNELS.REVIEW_IMAGE_SAVE, (_event, bytes: Uint8Array) => reviewImagesService.saveImage(bytes));

  handle(IPC_CHANNELS.GAME_RENAME, (_event, gameId: string, title: string | null) => {
    const game = renameGame(gameId, title);
    librarySyncService.scheduleSync();
    playLengthService.forget(game.id);
    const cleared = gameMetadataService.forget(game.id);
    gameMetadataService.enqueueMissing([game.id]);
    return cleared ?? game;
  });

  handle(IPC_CHANNELS.JOURNAL_EXPORT, (event) =>
    saveTextAs(
      event,
      {
        title: 'Exportar diário de jogos',
        defaultPath: 'lazulium-diario.json',
        filters: [
          { name: 'Cópia completa (JSON)', extensions: ['json'] },
          { name: 'Planilha (CSV)', extensions: ['csv'] }
        ]
      },
      (path) => (path.toLowerCase().endsWith('.csv') ? journalToCsv() : journalToJson())
    )
  );
}
