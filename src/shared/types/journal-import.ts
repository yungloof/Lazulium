import { Game, GameLog } from './game';

// Um jogo lido de um arquivo que a pessoa escolheu (página salva do Your Gamer Profile ou cópia do Diário).
// A leitura do arquivo acontece no próprio computador; nada disso vai para a internet.
export interface JournalImportItem {
  key: string;                      // Identifica o jogo dentro do arquivo (endereço no YGP ou nome normalizado)
  title: string;
  platform?: string;                // Como o arquivo chama a plataforma (ex: "PC (Steam)")
  steamAppId?: string;              // Só nas cópias do Lazulium: casa o jogo da Steam sem depender do nome
  playtimeSeconds?: number;         // Vale só para jogos novos no Diário; na biblioteca o Lazulium já mede
  achievements?: { unlocked: number; total: number };
  postedOn?: string;                // Dia em que a resenha foi publicada no YGP (AAAA-MM-DD). Só serve de data de término quando o arquivo não traz as datas do jogo.
  log: GameLog;
}

export type JournalImportSource = 'ygp' | 'lazulium';

export interface JournalImportParse {
  source: JournalImportSource;
  items: JournalImportItem[];
  expectedGames?: number;           // Total que o YGP mostra no topo da aba Jogos ("198 Jogos"): mede o que a página salva trouxe
  truncatedReviews: number;         // Resenhas que ainda estavam recolhidas ("Ler mais") na página salva
}

export interface JournalImportOptions {
  replaceExisting: boolean;         // Falso: só preenche o que está vazio. Verdadeiro: o arquivo vence nos campos que trouxer.
}

export type JournalImportAction = 'update' | 'create' | 'unchanged';

export interface JournalImportPreviewItem {
  key: string;
  title: string;
  action: JournalImportAction;
  matchedTitle?: string;            // Jogo da biblioteca que recebe o registro
  changes: Array<keyof GameLog>;    // Campos que serão gravados (ou, em 'create', que o jogo novo terá)
  kept: Array<keyof GameLog>;       // Campos que o arquivo trouxe mas já estão preenchidos e foram mantidos
}

export interface JournalImportApplyResult {
  updated: number;
  created: number;
  unchanged: number;
  games: Game[];                    // Jogos alterados ou criados, para a tela atualizar
}
