import raw from '../../../../CHANGELOG.md?raw';

// O CHANGELOG.md vai junto no app (é o mesmo texto das Releases) e vira a tela de Novidades.
// Formato: "## 1.1.0 — 12 de novembro de 2026", parágrafo de abertura, "### Novidades" e itens "- **Título.** texto".

export interface ChangelogSection {
  title: string;                    // "Novidades", "Melhorias", "Correções"
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  date?: string;
  intro?: string;
  sections: ChangelogSection[];
}

const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+))?$/;

export function parseChangelog(text: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(VERSION_HEADING);
    if (heading) {
      current = { version: heading[1], date: heading[2]?.trim(), sections: [] };
      section = null;
      releases.push(current);
      continue;
    }
    if (!current) continue;
    const sub = line.match(/^###\s+(.+)$/);
    if (sub) {
      section = { title: sub[1].trim(), items: [] };
      current.sections.push(section);
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      if (!section) {
        section = { title: 'Novidades', items: [] };
        current.sections.push(section);
      }
      section.items.push(item[1].trim());
      continue;
    }
    // Continuação de um item quebrado em mais linhas
    if (/^\s{2,}\S/.test(line) && section?.items.length) {
      section.items[section.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (line.trim() && line.trim() !== '---' && !section) current.intro = current.intro ? `${current.intro} ${line.trim()}` : line.trim();
  }
  return releases;
}

let cache: ChangelogRelease[] | null = null;
export const getChangelog = (): ChangelogRelease[] => (cache ??= parseChangelog(raw));
