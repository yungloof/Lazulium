import { readdirSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

type Service = typeof import('../../src/main/services/metadata/screenshot-capture.service')['screenshotCaptureService'];

// Tela de mentira: cada leitura demora um pouco, como a de verdade (cerca de 0,5 s), e conta quantas correm juntas
const grabs = { running: 0, maxRunning: 0, total: 0 };

function fakeImage() {
  const image = {
    getSize: () => ({ width: 64, height: 36 }),
    isEmpty: () => false,
    crop: () => image,
    toBitmap: () => Buffer.alloc(64 * 36 * 4, 200),
    toPNG: () => Buffer.from('png'),
    resize: () => ({ toJPEG: () => Buffer.from('jpg') })
  };
  return image;
}

let service: Service;
let dir: () => string;

beforeEach(async () => {
  useTempUserData();
  Object.assign(grabs, { running: 0, maxRunning: 0, total: 0 });
  vi.resetModules();
  const display = { id: 1, bounds: { x: 0, y: 0, width: 64, height: 36 } };
  vi.doMock('electron', async () => ({
    ...(await import('../helpers/electron-mock')),
    Notification: class {
      static isSupported = () => false;
    },
    globalShortcut: { register: () => true, unregister: () => undefined, isRegistered: () => false },
    screen: {
      getAllDisplays: () => [display],
      dipToScreenRect: (_w: unknown, rect: typeof display.bounds) => rect,
      getPrimaryDisplay: () => display,
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: () => ({ x: 0, y: 0 })
    },
    desktopCapturer: {
      getSources: async () => {
        grabs.total++;
        grabs.maxRunning = Math.max(grabs.maxRunning, ++grabs.running);
        await new Promise((resolve) => setTimeout(resolve, 15));
        grabs.running--;
        return [{ display_id: '1', thumbnail: fakeImage() }];
      }
    }
  }));
  // Sem PowerShell nos testes: a janela em primeiro plano fica desconhecida e a captura pega a tela toda
  vi.doMock('child_process', () => ({ execFile: (...args: unknown[]) => (args.at(-1) as (err: Error) => void)(new Error('sem PowerShell')) }));
  const { db } = await import('../../src/main/database/db');
  await db.init();
  db.upsertGames([makeGame({ id: 'jogo', title: 'Hollow Knight' })]);
  ({ screenshotCaptureService: service } = await import('../../src/main/services/metadata/screenshot-capture.service'));
  const { customScreenshotsDir } = await import('../../src/main/services/metadata/screenshots.service');
  dir = () => customScreenshotsDir('jogo');
});

describe('tecla de captura apertada várias vezes seguidas', () => {
  it('cada aperto vira uma captura, com nome próprio, e a tela é lida uma vez por vez', async () => {
    const results = await Promise.all([service.capture('jogo'), service.capture('jogo'), service.capture('jogo')]);
    const names = results.map((r) => r.fileName);
    expect(new Set(names).size).toBe(3);
    expect(readdirSync(dir()).filter((f) => f.endsWith('.png'))).toHaveLength(3);
    expect(grabs).toMatchObject({ total: 3, maxRunning: 1 });
  });

  it('só um monte de apertos de uma vez (tecla presa) é ignorado, e a fila volta a andar depois', async () => {
    const presses = Array.from({ length: 6 }, () => service.capture('jogo'));
    const settled = await Promise.allSettled(presses);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(4);
    expect(settled.filter((s) => s.status === 'rejected').map((s) => (s as PromiseRejectedResult).reason.message)).toEqual([
      'Muitas capturas seguidas: espere as anteriores terminarem.',
      'Muitas capturas seguidas: espere as anteriores terminarem.'
    ]);
    await expect(service.capture('jogo')).resolves.toMatchObject({ gameId: 'jogo' });
  });

  it('uma leitura que falha não trava as próximas', async () => {
    const electron = await import('electron');
    const original = electron.desktopCapturer.getSources;
    electron.desktopCapturer.getSources = async () => [];
    await expect(service.capture('jogo')).rejects.toThrow('O Windows não entregou');
    electron.desktopCapturer.getSources = original;
    await expect(service.capture('jogo')).resolves.toMatchObject({ gameId: 'jogo' });
  });
});
