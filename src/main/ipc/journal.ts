import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { GameLog } from '@shared/types/game';
import { JournalEntryInput } from '@shared/types/ipc';
import { artworkService } from '../services/metadata/artwork.service';
import { playLengthService } from '../services/metadata/play-length.service';
import { searchGameCatalog } from '../services/metadata/game-search.service';
import { socialService } from '../services/social/social.service';
import { addJournalEntry, journalToCsv, journalToJson, renameGame, setGameLog } from '../services/profile/journal.service';
import { handle, saveTextAs } from './helpers';

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
    return game;
  });

  handle(IPC_CHANNELS.JOURNAL_SEARCH_CATALOG, (_event, query: string) => searchGameCatalog(query));

  handle(IPC_CHANNELS.GAME_RENAME, (_event, gameId: string, title: string | null) => {
    const game = renameGame(gameId, title);
    playLengthService.forget(game.id);
    return game;
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
