import { JournalImportItem, JournalImportParse } from '@shared/types/journal-import';
import { parseLazuliumJournal } from './lazulium-json';
import { mergeYgpResults, parseYgpHtml, YgpParseResult } from './ygp-html';

export type ImportFileResult = { ok: true; name: string; parse: JournalImportParse } | { ok: false; name: string; error: string };

// Lê um arquivo escolhido pela pessoa (HTML salvo do YGP ou JSON do Lazulium) e devolve os jogos que achou
export async function readImportFile(file: File): Promise<ImportFileResult> {
  const text = await file.text();
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.json') || text.trimStart().startsWith('{')) {
    const items = parseLazuliumJournal(text);
    if (!items) return { ok: false, name: file.name, error: 'Esse JSON não é uma cópia do Diário do Lazulium.' };
    if (items.length === 0) return { ok: false, name: file.name, error: 'A cópia não tem nenhum jogo com registro.' };
    return { ok: true, name: file.name, parse: { source: 'lazulium', items, truncatedReviews: 0 } };
  }

  if (lower.endsWith('.htm') || lower.endsWith('.html') || /<html/i.test(text.slice(0, 2000))) {
    const result = parseYgpHtml(text);
    if (result.items.length === 0) {
      return { ok: false, name: file.name, error: 'Não achei jogos nessa página. Salve a aba Avaliações ou a aba Jogos do seu perfil no YGP.' };
    }
    return { ok: true, name: file.name, parse: { source: 'ygp', ...result } };
  }

  return { ok: false, name: file.name, error: 'Formato não reconhecido. Use a página salva do YGP (.htm) ou a cópia do Diário (.json).' };
}

// Soma o que vários arquivos do mesmo tipo trouxeram
export function mergeImportParses(parses: JournalImportParse[]): JournalImportParse | null {
  const ygp = parses.filter((p) => p.source === 'ygp');
  const lazulium = parses.filter((p) => p.source === 'lazulium');
  const items: JournalImportItem[] = [];
  const seen = new Set<string>();
  let expectedGames: number | undefined;
  let truncatedReviews = 0;

  if (ygp.length > 0) {
    const merged = mergeYgpResults(ygp as YgpParseResult[]);
    items.push(...merged.items);
    merged.items.forEach((i) => seen.add(i.key));
    expectedGames = merged.expectedGames;
    truncatedReviews = merged.truncatedReviews;
  }
  for (const parse of lazulium) {
    for (const item of parse.items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      items.push(item);
    }
  }
  if (items.length === 0) return null;
  return { source: ygp.length > 0 ? 'ygp' : 'lazulium', items, expectedGames, truncatedReviews };
}
