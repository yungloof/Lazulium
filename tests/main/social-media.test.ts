import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { mkdirSync, truncateSync, writeFileSync } from 'fs';
import { join } from 'path';
import { useTempUserData } from '../helpers/electron-mock';

type Db = typeof import('../../src/main/database/db')['db'];
type SocialService = typeof import('../../src/main/services/social/social.service')['socialService'];

interface CapturedCall {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

let db: Db;
let socialService: SocialService;
let server: Server;
let origin: string;
let calls: CapturedCall[];
let ticketStatus: number;
let putStatus: number;
let nextFileCounter: number;

function profileFile(userData: string, name: string, bytes: Buffer): string {
  const dir = join(userData, 'profile');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, name);
  writeFileSync(filePath, bytes);
  return filePath;
}

beforeEach(async () => {
  const userData = useTempUserData();
  calls = [];
  ticketStatus = 200;
  putStatus = 200;
  nextFileCounter = 0;

  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const body = await readBody(req);
    calls.push({ method: req.method ?? 'GET', path, headers: req.headers, body });

    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
    };

    if (req.method === 'GET' && path === '/v1/me') {
      return send(200, {
        user: { id: '00000000-0000-0000-0000-000000000001', name: 'Lazuli', avatarUrl: null },
        settings: {
          shareProfile: true,
          shareActivity: false,
          sharePlaytime: true,
          shareAchievements: true,
          shareReviews: true,
          shareNowPlaying: true
        }
      });
    }
    if (req.method === 'POST' && path === '/v1/me/media/background/upload') {
      if (ticketStatus !== 200) return send(ticketStatus, { error: ticketStatus === 501 ? 'no_store' : 'rejected' });
      return send(200, { uploadUrl: `${origin}/media/upload`, ticket: 'ticket-abc', maxBytes: 50 * 1024 * 1024 });
    }
    if (req.method === 'PUT' && path === '/media/upload') {
      if (putStatus !== 200) return send(putStatus, { error: putStatus === 507 ? 'store_full' : 'bad' });
      nextFileCounter++;
      return send(200, { url: `${origin}/media/f/00000000-0000-0000-0000-000000000001/bg-${nextFileCounter}` });
    }
    if (req.method === 'PUT' && path === '/v1/me/media/background') {
      nextFileCounter++;
      return send(200, { url: `${origin}/v1/media/tok-${nextFileCounter}` });
    }
    if (req.method === 'DELETE' && /^\/v1\/me\/media\/[a-z]+$/.test(path)) {
      return send(200, { ok: true });
    }
    if (req.method === 'PUT' && (path === '/v1/me/showcase' || path === '/v1/me/summary')) {
      return send(200, { ok: true });
    }
    return send(404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  process.env.LAZULIUM_SOCIAL_URL = origin;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const electron = (await import('electron')) as any;
  electron.nativeImage.createFromPath = () => ({
    isEmpty: () => false,
    getSize: () => ({ width: 1280, height: 720 }),
    resize: () => electron.nativeImage.createFromPath(),
    toJPEG: () => Buffer.from('jpeg-fallback-bytes')
  });

  await import('vitest').then(({ vi }) => vi.resetModules());
  ({ db } = await import('../../src/main/database/db'));
  await db.init();
  ({ socialService } = await import('../../src/main/services/social/social.service'));
  db.setSetting('socialToken', 'tok-user');
  db.setSetting(
    'socialProfile',
    JSON.stringify({
      user: { id: '00000000-0000-0000-0000-000000000001', name: 'Lazuli', avatarUrl: null },
      settings: {
        shareProfile: true,
        shareActivity: false,
        sharePlaytime: true,
        shareAchievements: true,
        shareReviews: true,
        shareNowPlaying: true
      }
    })
  );
  expect(userData).toBeTruthy();
});

afterEach(async () => {
  delete process.env.LAZULIUM_SOCIAL_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const electron = (await import('electron')) as any;
  delete electron.nativeImage.createFromPath;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('envio de mídia de fundo para amigos', () => {
  it('manda GIF pequeno no banco, GIF grande e vídeo em fluxo com bilhete para a VPS e limpa ao remover', async () => {
    const userData = db.getSettings() && (await import('electron')).app.getPath('userData');

    // 1. GIF <= 1,1 MB vai direto no servidor social (/v1/me/media/background)
    profileFile(userData, 'background-small.gif', Buffer.from('GIF89a-pequeno'));
    db.setProfileCustom({ backgroundMode: 'file', backgroundUrl: 'lazulium-media://profile/background-small.gif' });
    await socialService.sync();
    let showcase = JSON.parse(calls.findLast((c) => c.path === '/v1/me/showcase')!.body.toString());
    expect(showcase.web.background).toEqual({ imageUrl: `${origin}/v1/media/tok-1` });
    expect(calls.some((c) => c.path === '/v1/me/media/background/upload')).toBe(false);

    // 2. GIF > 1,1 MB pede bilhete e vai em fluxo para a VPS (/media/upload)
    calls = [];
    const bigGif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(1_200_000, 1)]);
    profileFile(userData, 'background-big.gif', bigGif);
    db.setProfileCustom({ backgroundMode: 'file', backgroundUrl: 'lazulium-media://profile/background-big.gif' });
    await socialService.sync();
    const ticketCall = calls.find((c) => c.path === '/v1/me/media/background/upload')!;
    expect(JSON.parse(ticketCall.body.toString())).toEqual({ mime: 'image/gif', size: bigGif.length });
    const uploadCall = calls.find((c) => c.path === '/media/upload')!;
    expect(uploadCall.headers.authorization).toBe('Bearer ticket-abc');
    expect(uploadCall.headers['content-type']).toBe('image/gif');
    expect(uploadCall.headers['content-length']).toBe(String(bigGif.length));
    expect(uploadCall.body.length).toBe(bigGif.length);
    showcase = JSON.parse(calls.findLast((c) => c.path === '/v1/me/showcase')!.body.toString());
    expect(showcase.web.background).toEqual({ imageUrl: `${origin}/media/f/00000000-0000-0000-0000-000000000001/bg-2` });

    // 3. Vídeo MP4 até 50 MB vai para a VPS como videoUrl; segunda sincronização aproveita o cache por hash
    calls = [];
    const mp4 = Buffer.concat([Buffer.from('00000018ftypmp42', 'latin1'), Buffer.alloc(2_048, 2)]);
    profileFile(userData, 'background-vid.mp4', mp4);
    db.setProfileCustom({ backgroundMode: 'file', backgroundUrl: 'lazulium-media://profile/background-vid.mp4' });
    await socialService.sync();
    expect(JSON.parse(calls.find((c) => c.path === '/v1/me/media/background/upload')!.body.toString())).toEqual({
      mime: 'video/mp4',
      size: mp4.length
    });
    expect(calls.find((c) => c.path === '/media/upload')!.body.equals(mp4)).toBe(true);
    showcase = JSON.parse(calls.findLast((c) => c.path === '/v1/me/showcase')!.body.toString());
    expect(showcase.web.background).toEqual({ videoUrl: `${origin}/media/f/00000000-0000-0000-0000-000000000001/bg-3` });

    calls = [];
    await socialService.sync();
    expect(calls.some((c) => c.path.includes('/media'))).toBe(false);
    expect(calls.some((c) => c.path === '/v1/me/showcase')).toBe(false);

    // 4. Trocar para sem fundo apaga a mídia remota e limpa o cache local
    calls = [];
    db.setProfileCustom({ backgroundMode: 'none' });
    await socialService.sync();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/v1/me/media/background')).toBe(true);
    showcase = JSON.parse(calls.findLast((c) => c.path === '/v1/me/showcase')!.body.toString());
    expect(showcase.web.background).toBeUndefined();
    expect(JSON.parse(db.getSettings().socialMedia || '{}').background).toBeUndefined();

    // 5. Vídeo acima de 50 MB (sparse file) não tenta subir e não quebra a sincronização
    calls = [];
    const hugePath = profileFile(userData, 'background-huge.webm', Buffer.from('1a45dfa3', 'hex'));
    truncateSync(hugePath, 50 * 1024 * 1024 + 1);
    db.setProfileCustom({ backgroundMode: 'file', backgroundUrl: 'lazulium-media://profile/background-huge.webm' });
    const status = await socialService.sync();
    expect(status.syncError).toBeUndefined();
    expect(calls.some((c) => c.path === '/v1/me/media/background/upload')).toBe(false);
  });

  it('cai para JPEG em GIF grande e ignora vídeo quando a guarda responde 501 ou 507', async () => {
    const userData = (await import('electron')).app.getPath('userData');
    const bigGif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(1_200_000, 1)]);
    profileFile(userData, 'background-big2.gif', bigGif);

    ticketStatus = 501;
    db.setProfileCustom({ backgroundMode: 'file', backgroundUrl: 'lazulium-media://profile/background-big2.gif' });
    await socialService.sync();
    const putJpeg = calls.find((c) => c.method === 'PUT' && c.path === '/v1/me/media/background')!;
    expect(JSON.parse(putJpeg.body.toString())).toEqual({
      mime: 'image/jpeg',
      data: Buffer.from('jpeg-fallback-bytes').toString('base64')
    });

    // Em 507 da VPS (disco cheio), vídeo é pulado sem derrubar a sincronização e apaga o cache anterior
    calls = [];
    ticketStatus = 200;
    putStatus = 507;
    // Simula um estado limpo sem storeUnavailable em memória recarregando via disco/token novo não é preciso: reiniciando instância em outro teste,
    // mas aqui confirmamos antes o logout -> login reabilita storeUnavailable:
    await socialService.logout();
    db.setSetting('socialToken', 'tok-user');
    db.setSetting(
      'socialProfile',
      JSON.stringify({
        user: { id: '00000000-0000-0000-0000-000000000001', name: 'Lazuli', avatarUrl: null },
        settings: {
          shareProfile: true,
          shareActivity: false,
          sharePlaytime: true,
          shareAchievements: true,
          shareReviews: true,
          shareNowPlaying: true
        }
      })
    );
    const webm = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(512, 9)]);
    profileFile(userData, 'background-full.webm', webm);
    db.setProfileCustom({ backgroundMode: 'file', backgroundUrl: 'lazulium-media://profile/background-full.webm' });
    const status = await socialService.sync();
    expect(status.syncError).toBeUndefined();
    expect(calls.some((c) => c.path === '/media/upload')).toBe(true);
    const showcase = JSON.parse(calls.findLast((c) => c.path === '/v1/me/showcase')!.body.toString());
    expect(showcase.web.background).toBeUndefined();
  });
});
