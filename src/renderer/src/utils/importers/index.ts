import { JournalImportItem, JournalImportParse } from '@shared/types/journal-import';
import { titleKey } from '@shared/utils/title-key';
import { BackloggdParseResult, isBackloggdHtml, mergeBackloggdResults, parseBackloggdHtml } from './backloggd-html';
import { parseLazuliumJournal } from './lazulium-json';
import { mergeYgpResults, parseYgpHtml, YgpParseResult } from './ygp-html';

export type ImportFileResult = { ok: true; name: string; parse: JournalImportParse } | { ok: false; name: string; error: string };

// Lê um arquivo escolhido pela pessoa (HTML salvo do YGP ou do Backloggd, ou JSON do Lazulium) e devolve os jogos que achou
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
    if (isBackloggdHtml(text)) {
      const result = parseBackloggdHtml(text);
      if (result.items.length === 0) {
        return { ok: false, name: file.name, error: 'Não achei jogos nessa página. Salve a página Games ou a página Reviews do seu perfil no Backloggd (a página Profile não traz os jogos).' };
      }
      return { ok: true, name: file.name, parse: { source: 'backloggd', ...result } };
    }
    const result = parseYgpHtml(text);
    if (result.items.length === 0) {
      return { ok: false, name: file.name, error: 'Não achei jogos nessa página. Salve a aba Avaliações ou a aba Jogos do seu perfil no YGP, ou a página Games ou Reviews do Backloggd.' };
    }
    return { ok: true, name: file.name, parse: { source: 'ygp', ...result } };
  }

  return { ok: false, name: file.name, error: 'Formato não reconhecido. Use a página salva do YGP ou do Backloggd (.htm) ou a cópia do Diário (.json).' };
}

// Soma o que vários arquivos trouxeram. Quando o mesmo jogo vem de fontes diferentes, vale a primeira: YGP, Backloggd, Lazulium.
export function mergeImportParses(parses: JournalImportParse[]): JournalImportParse | null {
  const ygp = parses.filter((p) => p.source === 'ygp');
  const backloggd = parses.filter((p) => p.source === 'backloggd');
  const lazulium = parses.filter((p) => p.source === 'lazulium');
  const items: JournalImportItem[] = [];
  const seen = new Set<string>();
  const seenTitles = new Set<string>();
  let expectedGames: number | undefined;
  let truncatedReviews = 0;

  // O mesmo título só é descartado quando já veio de outra fonte (dentro de uma fonte, dois jogos de mesmo nome podem ser versões diferentes)
  const take = (list: JournalImportItem[]): void => {
    const fromOtherSources = new Set(seenTitles);
    for (const item of list) {
      const title = titleKey(item.title);
      if (seen.has(item.key) || (title && fromOtherSources.has(title))) continue;
      seen.add(item.key);
      if (title) seenTitles.add(title);
      items.push(item);
    }
  };

  if (ygp.length > 0) {
    const merged = mergeYgpResults(ygp as YgpParseResult[]);
    take(merged.items);
    expectedGames = merged.expectedGames;
    truncatedReviews = merged.truncatedReviews;
  }
  if (backloggd.length > 0) {
    const merged = mergeBackloggdResults(backloggd as BackloggdParseResult[]);
    take(merged.items);
    // Só vale o total de uma fonte: o do YGP, se houver, já está acima
    expectedGames ??= merged.expectedGames;
  }
  for (const parse of lazulium) take(parse.items);

  if (items.length === 0) return null;
  const source = ygp.length > 0 ? 'ygp' : backloggd.length > 0 ? 'backloggd' : 'lazulium';
  return { source, items, expectedGames, truncatedReviews };
}
