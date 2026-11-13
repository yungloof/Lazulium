// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"disableIframePageLoading":true,"disableJavaScriptFileLoading":true}}
import { describe, expect, it } from 'vitest';
import { mergeImportParses } from '../../src/renderer/src/utils/importers';
import { parseLazuliumJournal } from '../../src/renderer/src/utils/importers/lazulium-json';
import { mergeYgpResults, parseBrDate, parsePlaytime, parsePostedDate, parseYgpHtml } from '../../src/renderer/src/utils/importers/ygp-html';

// Estrelas: cada caixa tem uma camada com a largura (%) do quanto está cheia
const stars = (...fills: number[]) =>
  `<div class="flex items-center gap-0.5">${fills
    .map((f) => `<div class="relative h-3 w-3"><svg></svg>${f > 0 ? `<div class="absolute inset-0 overflow-hidden" style="width: ${f}%;"><svg></svg></div>` : ''}</div>`)
    .join('')}</div>`;

// Mesmo formato das páginas salvas do YGP (reduzido ao que o leitor usa)
const reviewArticle = (opts: { slug: string; title: string; status?: string; fills: number[]; time: string; ach?: string; platform?: string; body: string; more?: boolean }) => `
<article>
  <a aria-label="${opts.title}" href="https://yourgamerprofile.com/games/${opts.slug}"><img alt="" src="x.jpg"></a>
  <a class="truncate font-bold" href="https://yourgamerprofile.com/games/${opts.slug}">${opts.title}</a><span class="text-sm">· 14 ago</span>
  <div>${stars(...opts.fills)}<span aria-hidden="true">·</span>
    <span class="flex items-center gap-1"><svg></svg><span class="font-medium">${opts.time}</span></span>
    ${opts.ach ? `<span class="hidden sm:flex"><svg></svg><span class="font-medium">${opts.ach}</span></span>` : ''}
    ${opts.status ? `<span class="flex items-center gap-1" title="${opts.status}"><svg></svg><span class="hidden sm:inline">${opts.status}</span></span>` : ''}
    ${opts.platform ? `<span class="flex min-w-0" title="${opts.platform}"><span class="hidden sm:inline">em ${opts.platform}</span></span>` : ''}
  </div>
  <h3>Reviews do Syrea | ${opts.title}</h3>
  <div class="flow-root">${opts.body}</div>
  ${opts.more ? '<button type="button">Ler mais</button>' : '<button type="button">Ler menos</button>'}
</article>`;

const gameRow = (index: number, opts: { slug: string; title: string; status?: string; fills: number[]; ach: string; time: string; dates?: string }) => `
<div data-index="${index}">
  <a href="https://yourgamerprofile.com/games/${opts.slug}"><img alt="${opts.title}" src="x.webp"></a>
  <a class="truncate" href="https://yourgamerprofile.com/games/${opts.slug}">${opts.title}</a>
  <div role="img" title="Steam" aria-label="Steam"><svg></svg></div>
  ${stars(...opts.fills)}
  ${opts.status ? `<span class="rounded"><svg></svg> ${opts.status}</span>` : ''}
  <button title="Conquistas"><svg></svg><span>${opts.ach}</span></button>
  <div><svg></svg><span>${opts.time}</span></div>
  ${opts.dates ? `<div><svg></svg><span>${opts.dates}</span></div>` : ''}
  <span>${opts.ach.split('/')[0] === opts.ach.split('/')[1] ? '100%' : '20%'}</span>
</div>`;

const header = '<a href="https://yourgamerprofile.com/Fulana/games?tab=all" aria-label="198 Jogos"></a>';

const reviewsPage = `<html><body>${header}
${reviewArticle({
  slug: 'en-garde',
  title: 'En Garde!',
  status: 'Finalizado',
  fills: [100, 100, 100, 50, 0],
  time: '3h 43m',
  ach: '11/30',
  platform: 'PC (Steam)',
  body: '<h2>En Garde!</h2><p>Primeiro parágrafo com <b>negrito</b> &amp; entidade.</p><p>Linha um<br>linha dois</p><ul><li>item A</li><li>item B</li></ul>'
})}
${reviewArticle({ slug: 'cyberpunk-2077', title: 'Cyberpunk 2077', fills: [100, 100, 100, 100, 100], time: '37h 28m', body: '<p>Curtinho.</p>', more: true })}
</body></html>`;

const gamesPage = `<html><body>${header}
${gameRow(82, { slug: 'wavetale', title: 'Wavetale', fills: [100, 100, 100, 100, 100], ach: '14/14', time: '4h 11m', dates: '27/01/26 → 28/01/26' })}
${gameRow(83, { slug: 'cyberpunk-2077', title: 'Cyberpunk 2077', status: 'Finalizado', fills: [100, 100, 100, 100, 100], ach: '18/57', time: '37h 28m', dates: '26/12/25 → 26/01/26' })}
${gameRow(84, { slug: 'megabonk', title: 'Megabonk', status: 'Abandonado', fills: [0, 0, 0, 0, 0], ach: '12/139', time: '58m', dates: '29/12/25' })}
${gameRow(85, { slug: 'the-forest', title: 'The Forest', status: 'Pausado', fills: [100, 100, 50, 0, 0], ach: '6/45', time: '5h 47m' })}
</body></html>`;

describe('leitor da página salva do YGP', () => {
  it('converte tempo e datas no formato do site', () => {
    expect(parsePlaytime('3h 43m')).toBe(3 * 3600 + 43 * 60);
    expect(parsePlaytime('58m')).toBe(58 * 60);
    expect(parsePlaytime('2h')).toBe(7200);
    expect(parsePlaytime('abc')).toBeUndefined();
    expect(parseBrDate('27/01/26')).toBe('2026-01-27');
    expect(parseBrDate('3/2/2025')).toBe('2025-02-03');
    expect(parseBrDate('99/99/26')).toBeUndefined();
  });

  it('lê a data da postagem: com ano, sem ano e sem cair no futuro', () => {
    const now = new Date(2026, 10, 13); // 13/11/2026
    expect(parsePostedDate('· 30 jul 2025', now)).toBe('2025-07-30');
    expect(parsePostedDate('· 14 ago', now)).toBe('2026-08-14');
    expect(parsePostedDate('· 1 fev 2025', now)).toBe('2025-02-01');
    expect(parsePostedDate('· 20 dez', now)).toBe('2025-12-20'); // dezembro ainda não chegou: é do ano passado
    expect(parsePostedDate('há 2 dias', now)).toBeUndefined();
  });

  it('lê as resenhas: status, nota em meia estrela, horas, conquistas, plataforma e texto', () => {
    const { items, expectedGames } = parseYgpHtml(reviewsPage);
    expect(items).toHaveLength(2);
    expect(expectedGames).toBe(198);

    const [garde, cyber] = items;
    expect(garde).toMatchObject({
      key: 'ygp:en-garde',
      title: 'En Garde!',
      platform: 'PC (Steam)',
      playtimeSeconds: 3 * 3600 + 43 * 60,
      achievements: { unlocked: 11, total: 30 }
    });
    expect(garde.log.status).toBe('finished');
    expect(garde.log.rating).toBe(3.5);
    // O título repetido some; parágrafos, quebra de linha e lista viram texto simples
    expect(garde.log.review).toBe('Primeiro parágrafo com negrito & entidade.\n\nLinha um\nlinha dois\n\n- item A\n- item B');
    expect(cyber.log.rating).toBe(5);
    expect(cyber.log.status).toBeUndefined();
    expect(garde.postedOn).toMatch(/^\d{4}-08-14$/);
  });

  it('conta resenhas que ainda estavam recolhidas ("Ler mais")', () => {
    expect(parseYgpHtml(reviewsPage).truncatedReviews).toBe(1);
  });

  it('lê as linhas da aba Jogos, inclusive sem resenha, com datas e 100% sem rótulo', () => {
    const { items } = parseYgpHtml(gamesPage);
    expect(items.map((i) => i.key)).toEqual(['ygp:wavetale', 'ygp:cyberpunk-2077', 'ygp:megabonk', 'ygp:the-forest']);

    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    // Sem rótulo, mas com todas as conquistas: 100%
    expect(byKey['ygp:wavetale'].log).toMatchObject({ status: 'completed', rating: 5, startedOn: '2026-01-27', finishedOn: '2026-01-28' });
    expect(byKey['ygp:wavetale'].platform).toBe('Steam');
    // Uma data só vira o início; estrelas vazias não viram nota
    expect(byKey['ygp:megabonk'].log).toMatchObject({ status: 'dropped', startedOn: '2025-12-29' });
    expect(byKey['ygp:megabonk'].log.rating).toBeUndefined();
    expect(byKey['ygp:megabonk'].log.finishedOn).toBeUndefined();
    expect(byKey['ygp:megabonk'].playtimeSeconds).toBe(58 * 60);
    expect(byKey['ygp:the-forest'].log).toMatchObject({ status: 'paused', rating: 2.5 });
  });

  it('soma vários arquivos sem duplicar o mesmo jogo', () => {
    const merged = mergeYgpResults([parseYgpHtml(reviewsPage), parseYgpHtml(gamesPage)]);
    expect(merged.items).toHaveLength(5); // En Garde, Cyberpunk (nos dois), Wavetale, Megabonk, The Forest
    const cyber = merged.items.find((i) => i.key === 'ygp:cyberpunk-2077')!;
    // Datas e status vêm da aba Jogos, o texto da aba Avaliações
    expect(cyber.log).toMatchObject({ status: 'finished', rating: 5, startedOn: '2025-12-26', finishedOn: '2026-01-26', review: 'Curtinho.' });
    expect(merged.expectedGames).toBe(198);
  });

  it('não acha jogos numa página qualquer', () => {
    expect(parseYgpHtml('<html><body><p>Olá</p></body></html>').items).toHaveLength(0);
  });
});

describe('cópia do Diário do Lazulium', () => {
  const copy = (games: unknown[]) => JSON.stringify({ schema: 'lazulium-journal/1', games });

  it('lê só quem tem algo registrado e reconhece jogo da Steam pelo id', () => {
    const items = parseLazuliumJournal(
      copy([
        { title: 'Hades', platform: 'steam', steamAppId: '1145360', playtimeSeconds: 3600, log: { status: 'finished', rating: 5, review: 'Ótimo' } },
        { title: 'Sem registro', platform: 'steam', log: {} },
        { title: 'Celeste', platform: 'Switch', log: { rating: 4.5 } }
      ])
    )!;
    expect(items.map((i) => i.title)).toEqual(['Hades', 'Celeste']);
    expect(items[0]).toMatchObject({ key: 'steam:1145360', steamAppId: '1145360', playtimeSeconds: 3600 });
    expect(items[1].key).toBe('t:celeste');
  });

  it('recusa o que não é uma cópia do Diário', () => {
    expect(parseLazuliumJournal('não é json')).toBeNull();
    expect(parseLazuliumJournal(JSON.stringify({ schema: 'outra-coisa/1', games: [] }))).toBeNull();
    expect(parseLazuliumJournal(JSON.stringify({ games: [] }))).toBeNull();
  });

  it('mescla arquivos de tipos diferentes: o YGP vence quando o jogo repete', () => {
    const ygp = { source: 'ygp' as const, ...parseYgpHtml(reviewsPage) };
    const lazulium = { source: 'lazulium' as const, truncatedReviews: 0, items: parseLazuliumJournal(copy([{ title: 'Celeste', log: { rating: 4 } }]))! };
    const merged = mergeImportParses([ygp, lazulium])!;
    expect(merged.items.map((i) => i.title)).toEqual(['En Garde!', 'Cyberpunk 2077', 'Celeste']);
  });
});
