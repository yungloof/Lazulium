// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"disableIframePageLoading":true,"disableJavaScriptFileLoading":true}}
import { describe, expect, it } from 'vitest';
import { mergeImportParses } from '../../src/renderer/src/utils/importers';
import { isBackloggdHtml, mergeBackloggdResults, parseBackloggdHtml } from '../../src/renderer/src/utils/importers/backloggd-html';
import { parseYgpHtml } from '../../src/renderer/src/utils/importers/ygp-html';

// Mesmo formato das páginas salvas do Backloggd (reduzido ao que o leitor usa)
const card = (opts: { id: number; slug: string; title: string; rating?: number; status?: string; playing?: boolean; backlog?: boolean; wishlist?: boolean }) => `
<div class="card mx-auto game-cover quick-access fade-played" game_id="${opts.id}">
  <a href="/games/${opts.slug}/" class="cover-link"></a>
  <div class="overflow-wrapper"><img class="card-img height" src="x.jpg" alt="${opts.title}"></div>
  <div class="game-text-centered">${opts.title}</div>
</div>
<div class="d-none" id="preloaded-log-${opts.id}">
  <div data-is-play="2024-05-30 07:10:08 UTC" data-is-playing="${opts.playing ? 'true' : ''}" data-is-backlog="${opts.backlog ? 'true' : ''}" data-is-wishlist="${opts.wishlist ? 'true' : ''}" data-is-liked="" data-log-id="${opts.id}0" data-rating="${opts.rating ?? ''}" data-status-title="${opts.status ?? ''}"></div>
</div>`;

const gamesPage = `<html><head><title>Fulana&#39;s games | Backloggd</title></head><body data-route="user#games">
<p>Showing 6 games</p>
${card({ id: 1, slug: 'bayonetta', title: 'Bayonetta', rating: 10, status: 'Completed' })}
${card({ id: 2, slug: 'bully-scholarship-edition', title: 'Bully: Scholarship Edition', rating: 7, status: 'Completed' })}
${card({ id: 3, slug: 'hollow-knight', title: 'Hollow Knight', rating: 8, status: 'Shelved', playing: true })}
${card({ id: 4, slug: 'celeste', title: 'Celeste', rating: 5, status: 'Retired', playing: true })}
${card({ id: 5, slug: 'dark-souls', title: 'Dark Souls', rating: 3, status: 'Abandoned' })}
${card({ id: 6, slug: 'hades', title: 'Hades', backlog: true })}
${card({ id: 7, slug: 'desejado', title: 'Só Desejado', wishlist: true })}
</body></html>`;

const reviewBlock = (opts: { id: number; slug: string; title: string; width: number; status?: string; platform?: string; date: string; text: string }) => `
<div class="row mb-1 game-name"><a href="/games/${opts.slug}/"><h3 class="mb-0">${opts.title}</h3></a></div>
<div class="row pt-2 pb-1 review-card">
  <a href="/games/${opts.slug}/"><div class="card mx-auto game-cover overlay-hide" game_id="${opts.id}"><img class="card-img height" src="x.jpg" alt="${opts.title}"></div></a>
  <div class="stars-top" style="width:${opts.width}%"></div><div class="stars-bottom"></div>
  ${opts.status ? `<p class="mb-0 play-type completed">${opts.status}</p>` : ''}
  ${opts.platform ? `<a class="my-0 ml-auto review-platform" href="/u/x/games/added/played_platform:win/"><p class="mb-0">${opts.platform}</p></a>` : ''}
  <time datetime="${opts.date}" class="local-time-tooltip">x</time>
  <div class="review-body"><div class="mb-0 card-text" id="collapseReview${opts.id}">${opts.text}</div></div>
</div>`;

const reviewsPage = `<html><head><title>Fulana&#39;s reviews | Backloggd</title></head><body data-route="user#reviews">
${reviewBlock({ id: 2, slug: 'bully-scholarship-edition', title: 'Bully: Scholarship Edition', width: 70, status: 'Completed', date: '2026-04-16T15:55:38Z', text: ' Bom jogo, port ruim.<br>Não envelheceu tão bem &amp; é legal ' })}
${reviewBlock({ id: 8, slug: 'idols-of-ash', title: 'Idols of Ash', width: 50, status: 'Completed', platform: 'Windows PC', date: '2026-04-06T18:36:40Z', text: '<p>entendi nada</p><p>mesmo</p>' })}
${reviewBlock({ id: 9, slug: 'sem-nota', title: 'Sem Nota', width: 0, date: '2026-04-07T12:00:00Z', text: 'só texto' })}
</body></html>`;

describe('leitor das páginas salvas do Backloggd', () => {
  it('reconhece as páginas do Backloggd', () => {
    expect(isBackloggdHtml(gamesPage)).toBe(true);
    expect(isBackloggdHtml('<html><body data-route="other"></body></html>')).toBe(false);
  });

  it('lê a página Jogos: nota (1 a 10 vira meia estrela), status e marcas de jogando/backlog', () => {
    const { items, expectedGames } = parseBackloggdHtml(gamesPage);
    expect(expectedGames).toBe(6);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));

    expect(byKey['backloggd:bayonetta'].log).toEqual({ rating: 5, status: 'finished' });
    expect(byKey['backloggd:bully-scholarship-edition'].log).toEqual({ rating: 3.5, status: 'finished' });
    // O status escolhido vale mais que a marca "jogando"
    expect(byKey['backloggd:hollow-knight'].log).toEqual({ rating: 4, status: 'paused' });
    expect(byKey['backloggd:celeste'].log).toEqual({ rating: 2.5, status: 'endless' });
    expect(byKey['backloggd:dark-souls'].log).toEqual({ rating: 1.5, status: 'dropped' });
    expect(byKey['backloggd:hades'].log).toEqual({ status: 'backlog' });
    // Só na lista de desejos: não é jogo jogado
    expect(byKey['backloggd:desejado']).toBeUndefined();
    // A data do registro é a de quando a pessoa marcou (em massa), então não vira data de término
    expect(items.every((i) => !i.log.finishedOn && !i.postedOn)).toBe(true);
  });

  it('lê as resenhas: estrelas, status, plataforma e texto', () => {
    const { items } = parseBackloggdHtml(reviewsPage);
    expect(items.map((i) => i.title)).toEqual(['Bully: Scholarship Edition', 'Idols of Ash', 'Sem Nota']);
    const [bully, idols, semNota] = items;

    expect(bully.log).toMatchObject({ rating: 3.5, status: 'finished', review: 'Bom jogo, port ruim.\nNão envelheceu tão bem & é legal' });
    // A data da resenha é a do lançamento no site, não a do término: não vira data
    expect(items.every((i) => !i.postedOn && !i.log.finishedOn)).toBe(true);
    expect(idols).toMatchObject({ platform: 'Windows PC', log: { rating: 2.5, review: 'entendi nada\n\nmesmo' } });
    expect(semNota.log.rating).toBeUndefined();
    expect(semNota.log.review).toBe('só texto');
  });

  it('soma Jogos e Avaliações sem duplicar o mesmo jogo', () => {
    const merged = mergeBackloggdResults([parseBackloggdHtml(gamesPage), parseBackloggdHtml(reviewsPage)]);
    expect(merged.items).toHaveLength(8); // 6 da lista + Idols of Ash + Sem Nota (Bully está nos dois)
    const bully = merged.items.find((i) => i.key === 'backloggd:bully-scholarship-edition')!;
    expect(bully.log).toMatchObject({ rating: 3.5, status: 'finished', review: 'Bom jogo, port ruim.\nNão envelheceu tão bem & é legal' });
    expect(merged.expectedGames).toBe(6);
  });

  it('não acha jogos numa página qualquer', () => {
    expect(parseBackloggdHtml('<html><body data-route="user#profile"><p>Olá</p></body></html>').items).toHaveLength(0);
  });

  it('mescla com o YGP sem repetir o jogo que aparece nos dois (o YGP vence)', () => {
    const ygpPage = `<html><body><article>
      <a href="https://yourgamerprofile.com/games/bayonetta"></a>
      <a class="truncate font-bold" href="https://yourgamerprofile.com/games/bayonetta">Bayonetta</a>
      <div class="flow-root"><p>no YGP</p></div></article></body></html>`;
    const ygp = { source: 'ygp' as const, ...parseYgpHtml(ygpPage) };
    const backloggd = { source: 'backloggd' as const, ...parseBackloggdHtml(gamesPage) };
    expect(ygp.items.map((i) => i.title)).toContain('Bayonetta');
    const merged = mergeImportParses([backloggd, ygp])!;
    expect(merged.items.filter((i) => i.title === 'Bayonetta')).toHaveLength(1);
    expect(merged.items.find((i) => i.title === 'Bayonetta')!.key.startsWith('ygp:')).toBe(true);
    expect(merged.source).toBe('ygp');
  });

  it('mantém dois jogos de mesmo nome da mesma fonte (versões diferentes)', () => {
    const twin = (id: number, slug: string) => card({ id, slug, title: 'God of War', rating: 10, status: 'Completed' });
    const page = `<html><body data-route="user#games">${twin(1, 'god-of-war')}${twin(2, 'god-of-war--1')}</body></html>`;
    const merged = mergeImportParses([{ source: 'backloggd', ...parseBackloggdHtml(page) }])!;
    expect(merged.items.map((i) => i.key)).toEqual(['backloggd:god-of-war', 'backloggd:god-of-war--1']);
  });

  it('só do Backloggd: a fonte e o total esperado seguem o arquivo', () => {
    const merged = mergeImportParses([{ source: 'backloggd', ...parseBackloggdHtml(gamesPage) }])!;
    expect(merged.source).toBe('backloggd');
    expect(merged.expectedGames).toBe(6);
  });
});
