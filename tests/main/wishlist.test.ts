import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { useTempUserData } from '../helpers/electron-mock';

type FetchDeals = typeof import('../../src/main/services/metadata/wishlist.service')['fetchDeals'];
type OrderDealsTargets = typeof import('../../src/main/services/metadata/wishlist.service')['orderDealsTargets'];

let fetchDeals: FetchDeals;
let orderDealsTargets: OrderDealsTargets;
let server: Server;
let batches: string[];
let failOnBatch: number;
let failStatus: number;

beforeEach(async () => {
  useTempUserData();
  batches = [];
  failOnBatch = 0;
  failStatus = 429;
  server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const raw = url.searchParams.get('steamAppIds') ?? '';
    batches.push(raw);
    if (failOnBatch > 0 && batches.length === failOnBatch) {
      res.writeHead(failStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: failStatus === 429 ? 'rate_limited' : 'upstream_unavailable' }));
      return;
    }
    const ids = raw.split(',').filter(Boolean);
    const prices = Object.fromEntries(
      ids.map((id) => [
        id,
        {
          url: `https://gg.deals/steam/app/${id}/`,
          currency: 'BRL',
          retail: Number(id) * 100,
          keyshops: Number(id) * 80,
          lowestRetail: Number(id) * 50,
          lowestKeyshops: null
        }
      ])
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ source: 'gg.deals', region: 'br', prices }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  process.env.LAZULIUM_IGDB_PROXY_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ fetchDeals, orderDealsTargets } = await import('../../src/main/services/metadata/wishlist.service'));
});

afterEach(async () => {
  delete process.env.LAZULIUM_IGDB_PROXY_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('preços de outras lojas na lista de desejos', () => {
  it('divide listas grandes em lotes de 20 e mantém os lotes anteriores se um posterior falhar', async () => {
    const ids = Array.from({ length: 55 }, (_, i) => i + 1);
    const ok = await fetchDeals(ids);
    expect(ok.failed).toBe(false);
    expect(ok.deals.size).toBe(55);
    expect(batches.map((b) => b.split(',').length)).toEqual([20, 20, 15]);
    expect(ok.deals.get(1)?.retailCents).toBe(100);
    expect(ok.deals.get(55)?.keyshopCents).toBe(4400);

    batches = [];
    failOnBatch = 3;
    failStatus = 429;
    const partial = await fetchDeals(ids);
    expect(partial.failed).toBe(true);
    expect(partial.deals.size).toBe(40);
    expect(partial.deals.get(1)?.retailCents).toBe(100);
    expect(partial.deals.get(40)?.retailCents).toBe(4000);
    expect(partial.deals.has(41)).toBe(false);
  });

  it('prioriza jogos sem consulta anterior e depois os mais antigos', () => {
    const ordered = orderDealsTargets([
      { appId: 1, name: 'Recente', source: 'steam', addedAt: '2026-11-13T00:00:00Z', deals: { currency: 'BRL', checkedAt: '2026-11-13T02:00:00Z' } },
      { appId: 2, name: 'Sem deals', source: 'steam', addedAt: '2026-11-13T00:00:00Z' },
      { appId: 3, name: 'Antigo', source: 'steam', addedAt: '2026-11-13T00:00:00Z', deals: { currency: 'BRL', checkedAt: '2026-11-13T01:00:00Z' } }
    ]);
    expect(ordered).toEqual([2, 3, 1]);
  });
});
