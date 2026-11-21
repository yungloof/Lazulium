import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

type Db = typeof import('../../src/main/database/db')['db'];
type Module = typeof import('../../src/main/services/profile/review-images.service');

let db: Db;
let mod: Module;

// WebP "de mentira" com o cabeçalho certo (o serviço só confere o começo do arquivo)
const webp = (fill: number) => new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 '), ...new Array(40).fill(fill)]);

function fakeRemote(account = 'conta-1') {
  const server = new Map<string, string>();     // id -> base64
  const calls: string[] = [];
  const remote = {
    accountId: () => account,
    serverOrigin: () => 'https://social.test',
    list: vi.fn(async () => [...server.keys()].map((id) => ({ id, url: `https://social.test/v1/review-images/${id.slice(0, 16)}` }))),
    put: vi.fn(async (id: string, base64: string) => {
      calls.push(`put ${id}`);
      server.set(id, base64);
      return `https://social.test/v1/review-images/${id.slice(0, 16)}`;
    }),
    remove: vi.fn(async (id: string) => {
      calls.push(`del ${id}`);
      server.delete(id);
    })
  };
  return { remote, server, calls };
}

beforeEach(async () => {
  useTempUserData();
  vi.resetModules();
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  mod = await import('../../src/main/services/profile/review-images.service');
});

afterEach(() => {
  vi.useRealTimers();
});

const useImage = (id: string) => db.upsertGame(makeGame({ id: 'g1', log: { review: 'Oi', reviewImages: [{ id, at: 2, width: 10, height: 10 }] } }));

describe('imagens das resenhas', () => {
  it('guarda pelo conteúdo: a mesma imagem duas vezes é um arquivo só; recusa o que não é WebP/GIF', async () => {
    const svc = mod.reviewImagesService;
    const a = await svc.saveImage(webp(1));
    const b = await svc.saveImage(webp(1));
    expect(a.id).toMatch(/^[a-f0-9]{16}\.webp$/);
    expect(b.id).toBe(a.id);
    expect(a.url).toBe(`lazulium-media://review/${a.id}`);
    expect(readdirSync(svc.root())).toEqual([a.id]);
    await expect(svc.saveImage(new Uint8Array(Buffer.from('\x89PNG\r\n\x1a\n0000')))).rejects.toThrow('Formato');
    await expect(svc.saveImage(new Uint8Array(600_000))).rejects.toThrow('grande demais');
  });

  it('envia só as usadas em resenhas, uma vez; a que sai de todas é apagada do servidor depois de 15 dias', async () => {
    const svc = mod.reviewImagesService;
    const { remote, calls } = fakeRemote();
    svc.setRemote(remote);
    const used = (await svc.saveImage(webp(1))).id;
    const loose = (await svc.saveImage(webp(2))).id;
    useImage(used);

    await svc.syncServer(true);
    await svc.syncServer(true);
    expect(calls).toEqual([`put ${used}`]);
    expect(svc.publicUrl(used)).toContain('/v1/review-images/');
    expect(svc.publicUrl(loose)).toBeUndefined();

    // Tirou a imagem da resenha: fica 15 dias (dá para desfazer) e depois sai do servidor
    db.upsertGame(makeGame({ id: 'g1', log: { review: 'Oi' } }));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    await svc.syncServer(true);
    expect(calls).toEqual([`put ${used}`]);
    vi.setSystemTime(Date.now() + mod.UNUSED_GRACE_MS + 1000);
    await svc.syncServer(true);
    expect(calls).toEqual([`put ${used}`, `del ${used}`]);
    expect(svc.publicUrl(used)).toBeUndefined();
  });

  it('voltou para a resenha antes dos 15 dias: não apaga', async () => {
    const svc = mod.reviewImagesService;
    const { remote, calls } = fakeRemote();
    svc.setRemote(remote);
    const id = (await svc.saveImage(webp(3))).id;
    useImage(id);
    await svc.syncServer(true);
    db.upsertGame(makeGame({ id: 'g1', log: { review: 'Oi' } }));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    await svc.syncServer(true);
    useImage(id);
    await svc.syncServer(true);
    db.upsertGame(makeGame({ id: 'g1', log: { review: 'Oi' } }));
    vi.setSystemTime(Date.now() + mod.UNUSED_GRACE_MS + 1000);
    await svc.syncServer(true);
    // Saiu de novo agora: conta 15 dias a partir daqui
    expect(calls).toEqual([`put ${id}`]);
  });

  it('o que outro PC já mandou não vai de novo; outra conta começa do zero', async () => {
    const svc = mod.reviewImagesService;
    const first = fakeRemote();
    const id = (await svc.saveImage(webp(4))).id;
    first.server.set(id, 'x');
    svc.setRemote(first.remote);
    useImage(id);
    await svc.syncServer(true);
    expect(first.calls).toEqual([]);

    const other = fakeRemote('conta-2');
    svc.setRemote(other.remote);
    expect(svc.publicUrl(id)).toBeUndefined();
    await svc.syncServer(true);
    expect(other.calls).toEqual([`put ${id}`]);
  });

  it('imagem que este PC nunca usou (de outro PC) não é apagada do servidor, nem depois de 15 dias', async () => {
    const svc = mod.reviewImagesService;
    const { remote, server, calls } = fakeRemote();
    const foreign = `${'f'.repeat(16)}.webp`;
    server.set(foreign, 'x');
    svc.setRemote(remote);
    const id = (await svc.saveImage(webp(9))).id;
    useImage(id);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    await svc.syncServer(true);
    vi.setSystemTime(Date.now() + mod.UNUSED_GRACE_MS + 1000);
    await svc.syncServer(true);
    // Mesmo desligando o compartilhamento: só sai a que este PC usou
    await svc.syncServer(false);
    expect(calls).toEqual([`put ${id}`, `del ${id}`]);
    expect(server.has(foreign)).toBe(true);
  });

  it('sincronização desligada só aqui: a imagem que outro PC mandou fica no servidor para ele', async () => {
    const svc = mod.reviewImagesService;
    const { remote, server, calls } = fakeRemote();
    const id = (await svc.saveImage(webp(12))).id;
    server.set(id, 'x');
    svc.setRemote(remote);
    useImage(id);
    await svc.syncServer(true);
    await svc.syncServer(false);
    expect(calls).toEqual([]);
    expect(server.has(id)).toBe(true);
  });

  it('jogo que só existe em outro PC (sincronização pendente): as imagens dele ficam', async () => {
    const svc = mod.reviewImagesService;
    const { remote, server, calls } = fakeRemote();
    const pending = `${'a'.repeat(16)}.webp`;
    server.set(pending, 'x');
    svc.setRemote(remote);
    const real = db.getSyncState();
    vi.spyOn(db, 'getSyncState').mockReturnValue({
      ...real,
      syncUnresolved: { games: { 'steam:1': { log: { review: 'Oi', reviewImages: [{ id: pending, at: 2, width: 10, height: 10 }] } } as never } }
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    await svc.syncServer(true);
    vi.setSystemTime(Date.now() + mod.UNUSED_GRACE_MS + 1000);
    await svc.syncServer(true);
    expect(calls).toEqual([]);
    expect(server.has(pending)).toBe(true);
    vi.restoreAllMocks();
  });

  it('compartilhamento e sincronização desligados: tira do servidor tudo o que este PC mandou, sem enviar nada', async () => {
    const svc = mod.reviewImagesService;
    const { remote, server, calls } = fakeRemote();
    svc.setRemote(remote);
    const a = (await svc.saveImage(webp(10))).id;
    const b = (await svc.saveImage(webp(11))).id;
    useImage(a);
    await svc.syncServer(true);
    db.upsertGame(makeGame({ id: 'g2', log: { review: 'Ei', reviewImages: [{ id: b, at: 2, width: 10, height: 10 }] } }));
    await svc.syncServer(false);
    expect(calls).toEqual([`put ${a}`, `del ${a}`]);
    expect(server.size).toBe(0);
    expect(svc.publicUrl(a)).toBeUndefined();
    // Ligou de novo: volta a enviar
    await svc.syncServer(true);
    expect(calls.slice(2).sort()).toEqual([`put ${a}`, `put ${b}`].sort());
  });

  it('limpeza deste PC: arquivo sem resenha há 15 dias sai; o usado fica', async () => {
    const svc = mod.reviewImagesService;
    const used = (await svc.saveImage(webp(5))).id;
    const loose = (await svc.saveImage(webp(6))).id;
    writeFileSync(join(svc.root(), 'qualquer.txt'), 'não é imagem');
    useImage(used);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    expect(await svc.sweepLocal()).toBe(0);
    vi.setSystemTime(Date.now() + mod.UNUSED_GRACE_MS + 1000);
    expect(await svc.sweepLocal()).toBe(1);
    expect(existsSync(join(svc.root(), used))).toBe(true);
    expect(existsSync(join(svc.root(), loose))).toBe(false);
    expect(existsSync(join(svc.root(), 'qualquer.txt'))).toBe(true);
  });

  it('outro PC: traz do servidor a imagem que veio pela sincronização, conferindo o conteúdo', async () => {
    const svc = mod.reviewImagesService;
    const { remote, server } = fakeRemote();
    const bytes = webp(7);
    const id = mod.reviewImageIdOf(bytes)!;
    server.set(id, 'x');
    svc.setRemote(remote);
    const fetchMissing = (svc as unknown as { fetchMissing: (id: string) => Promise<boolean> }).fetchMissing.bind(svc);

    // Servidor devolve outra coisa: não grava
    const wrong = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(webp(8)));
    expect(await fetchMissing(id)).toBe(false);
    expect(existsSync(join(svc.root(), id))).toBe(false);
    wrong.mockResolvedValue(new Response(bytes));
    expect(await fetchMissing(id)).toBe(true);
    expect(existsSync(join(svc.root(), id))).toBe(true);
    expect(String(wrong.mock.calls[0][0])).toMatch(/^https:\/\/social\.test\/v1\/review-images\//);
    // Nome inválido nem pergunta ao servidor
    expect(await fetchMissing('../x.webp')).toBe(false);
    wrong.mockRestore();
  });

  it('id é o hash do conteúdo: nome e tipo conferidos', () => {
    expect(mod.reviewImageKind(webp(1))).toBe('webp');
    expect(mod.reviewImageKind(new Uint8Array(Buffer.from('GIF89a......')))).toBe('gif');
    expect(mod.reviewImageIdOf(new Uint8Array(Buffer.from('não é imagem')))).toBeNull();
    expect(mod.reviewImageIdOf(webp(1))).not.toBe(mod.reviewImageIdOf(webp(2)));
  });
});
