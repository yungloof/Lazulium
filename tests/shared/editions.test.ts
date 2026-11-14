import { describe, expect, it } from 'vitest';
import { Game, GamePlatform } from '../../src/shared/types/game';
import { editionIds, foldEditions, launchEdition, parseEditionPrefs, resolveEditionIds } from '../../src/shared/utils/editions';
import { isGameInCategory } from '../../src/shared/utils/categories';

const game = (id: string, platform: GamePlatform, extra: Partial<Game> = {}): Game =>
  ({ id, title: 'Grand Theft Auto V', platform, isFavorite: false, isHidden: false, totalPlaytimeSeconds: 0, media: {}, tags: [], ...extra }) as Game;

describe('mesmo jogo em lojas diferentes', () => {
  it('junta Steam e Epic num card só, com a Steam de principal e as horas somadas', () => {
    const raw = [
      game('epic-gta', 'epic', { totalPlaytimeSeconds: 3600, lastPlayedAt: '2026-11-10T00:00:00Z', isFavorite: true }),
      game('steam-gta', 'steam', { totalPlaytimeSeconds: 7200, lastPlayedAt: '2026-10-01T00:00:00Z', isInstalled: false }),
      game('steam-hades', 'steam', { title: 'Hades' })
    ];
    const { games, primaryOf } = foldEditions(raw);
    expect(games.map((g) => g.id)).toEqual(['steam-gta', 'steam-hades']);
    const gta = games[0];
    expect(gta.totalPlaytimeSeconds).toBe(10800);
    expect(gta.isInstalled).toBe(true);
    expect(gta.isFavorite).toBe(true);
    expect(gta.lastPlayedAt).toBe('2026-11-10T00:00:00Z');
    expect(gta.editions?.map((e) => e.platform)).toEqual(['steam', 'epic']);
    expect(primaryOf.get('epic-gta')).toBe('steam-gta');
    expect(primaryOf.has('steam-hades')).toBe(false);
  });

  it('não junta dois da mesma loja, nem registro à mão, oculto ou de emulador', () => {
    const raw = [
      game('steam-a', 'steam'),
      game('steam-b', 'steam'),
      game('manual', 'epic', { manualEntry: true }),
      game('hidden', 'gog', { isHidden: true }),
      game('emu', 'emulator')
    ];
    expect(foldEditions(raw).games).toHaveLength(5);
  });

  it('nome com acento, símbolo ou parênteses cai no mesmo jogo; renomear não separa', () => {
    const raw = [
      game('s', 'steam', { title: 'Pokémon Legends™', customTitle: 'Meu Pokémon', detectedTitle: 'Pokémon Legends™' }),
      game('e', 'epic', { title: 'Pokemon Legends (Epic)' })
    ];
    expect(foldEditions(raw).games).toHaveLength(1);
  });

  it('o que o jogador separou volta a ser um card por loja', () => {
    const raw = [game('s', 'steam'), game('e', 'epic')];
    expect(foldEditions(raw, { split: ['grandtheftautov'], preferred: {} }).games).toHaveLength(2);
  });

  it('o Diário vem da principal; se só a outra loja tinha, aparece o dela', () => {
    const fromEpic = foldEditions([game('s', 'steam'), game('e', 'epic', { log: { status: 'finished' } })]).games[0];
    expect(fromEpic.log?.status).toBe('finished');
    const fromSteam = foldEditions([game('s', 'steam', { log: { rating: 4 } }), game('e', 'epic', { log: { status: 'finished' } })]).games[0];
    expect(fromSteam.log).toEqual({ rating: 4 });
  });

  it('abre pela loja escolhida; sem escolha, pela instalada jogada por último', () => {
    const [gta] = foldEditions([
      game('s', 'steam', { lastPlayedAt: '2026-01-01T00:00:00Z' }),
      game('e', 'epic', { lastPlayedAt: '2026-11-01T00:00:00Z' }),
      game('g', 'gog', { isInstalled: false, lastPlayedAt: '2026-12-01T00:00:00Z' })
    ]).games;
    expect(launchEdition(gta)).toBe('e');
    expect(launchEdition(gta, 's')).toBe('s');
    // Escolhida, mas desinstalada: vai pela outra
    expect(launchEdition(gta, 'g')).toBe('e');
    expect(launchEdition({ id: 'solo' })).toBe('solo');
  });

  it('nenhuma instalada: a escolhida ou a principal', () => {
    const [gta] = foldEditions([game('s', 'steam', { isInstalled: false }), game('e', 'epic', { isInstalled: false })]).games;
    expect(launchEdition(gta)).toBe('s');
    expect(launchEdition(gta, 'e')).toBe('e');
  });

  it('listas e categorias antigas com o id da outra loja continuam valendo', () => {
    const { games, primaryOf } = foldEditions([game('s', 'steam'), game('e', 'epic')]);
    expect(resolveEditionIds(['e', 'x', 's'], primaryOf)).toEqual(['s', 'x']);
    expect(editionIds(games[0])).toEqual(['s', 'e']);
    const category = { id: 'c', name: 'Mundo aberto', gameIds: ['e'], createdAt: '', updatedAt: '' };
    expect(isGameInCategory(games[0], category)).toBe(true);
    expect(isGameInCategory(games[0], { ...category, gameIds: [], rule: { platforms: ['epic'] } })).toBe(true);
  });

  it('preferências salvas: lê o JSON e ignora lixo', () => {
    expect(parseEditionPrefs({ editionsSplit: '["a", 2]', editionsPreferred: '{"s":"e","x":3}' })).toEqual({ split: ['a'], preferred: { s: 'e' } });
    expect(parseEditionPrefs({ editionsSplit: '{', editionsPreferred: '[1]' })).toEqual({ split: [], preferred: {} });
    expect(parseEditionPrefs(undefined)).toEqual({ split: [], preferred: {} });
  });
});
