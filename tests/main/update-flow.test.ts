import { describe, expect, it } from 'vitest';
import {
  QUIET_INSTALL_MIN_UPTIME_MS,
  STARTUP_CHECK_TIMEOUT_MS,
  STARTUP_DOWNLOAD_MAX_MS,
  StartupUpdateUi,
  canInstallQuietly,
  updateBeforeOpening
} from '../../src/main/services/updater/update-flow';

// Relógio de mentira: wait(ms) só termina quando o teste avança o tempo
function fakeClock() {
  let now = 0;
  const timers: { at: number; resolve: () => void }[] = [];
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    wait: (ms: number) => new Promise<void>((resolve) => timers.push({ at: now + ms, resolve })),
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        await settle();
        const next = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers.splice(timers.indexOf(next), 1);
        now = next.at;
        next.resolve();
      }
      now = target;
      await settle();
    }
  };
}

function fakeUi() {
  const log: string[] = [];
  let skip!: () => void;
  const ui: StartupUpdateUi = {
    checking: () => log.push('procurando'),
    downloading: (v) => log.push(`baixando ${v}`),
    installing: (v) => log.push(`instalando ${v}`),
    close: () => log.push('fechou'),
    skipped: new Promise<void>((resolve) => (skip = resolve))
  };
  return { ui, log, skip: () => skip() };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe('atualização ao abrir', () => {
  it('sem versão nova e resposta rápida: abre direto, sem mostrar janelinha', async () => {
    const clock = fakeClock();
    const { ui, log } = fakeUi();
    let created = 0;
    const result = updateBeforeOpening({ check: async () => null, install: () => log.push('instalou'), createUi: () => (created++, ui), wait: clock.wait });
    await clock.advance(100);
    expect(await result).toBe('open');
    expect(created).toBe(0);
  });

  it('versão nova: mostra a janelinha, baixa e instala', async () => {
    const clock = fakeClock();
    const { ui, log } = fakeUi();
    const download = deferred();
    const result = updateBeforeOpening({
      check: async () => ({ version: '3.2.0', download: download.promise }),
      install: () => log.push('instalou'),
      createUi: () => ui,
      wait: clock.wait
    });
    await clock.advance(10);
    expect(log).toEqual(['baixando 3.2.0']);
    download.resolve();
    expect(await result).toBe('installing');
    expect(log).toEqual(['baixando 3.2.0', 'instalando 3.2.0', 'instalou']);
  });

  it('internet ruim: depois do prazo da procura abre normal', async () => {
    const clock = fakeClock();
    const { ui, log } = fakeUi();
    const result = updateBeforeOpening({ check: () => new Promise(() => undefined), install: () => log.push('instalou'), createUi: () => ui, wait: clock.wait });
    await clock.advance(1_000);
    expect(log).toEqual(['procurando']);           // Demorou: a janelinha aparece para não parecer travado
    await clock.advance(STARTUP_CHECK_TIMEOUT_MS);
    expect(await result).toBe('open');
    expect(log).toEqual(['procurando', 'fechou']);
  });

  it('erro na procura (sem internet): abre normal', async () => {
    const clock = fakeClock();
    const { ui, log } = fakeUi();
    const result = updateBeforeOpening({ check: async () => Promise.reject(new Error('offline')), install: () => log.push('instalou'), createUi: () => ui, wait: clock.wait });
    await clock.advance(10);
    expect(await result).toBe('open');
    expect(log).not.toContain('instalou');
  });

  it('"Abrir agora": abre sem esperar o download, que segue por trás', async () => {
    const clock = fakeClock();
    const { ui, log, skip } = fakeUi();
    const result = updateBeforeOpening({
      check: async () => ({ version: '3.2.0', download: new Promise(() => undefined) }),
      install: () => log.push('instalou'),
      createUi: () => ui,
      wait: clock.wait
    });
    await clock.advance(10);
    skip();
    expect(await result).toBe('open');
    expect(log).toEqual(['baixando 3.2.0', 'fechou']);
  });

  it('download longo demais ou com erro: abre normal', async () => {
    const clock = fakeClock();
    const slow = fakeUi();
    const longResult = updateBeforeOpening({
      check: async () => ({ version: '3.2.0', download: new Promise(() => undefined) }),
      install: () => slow.log.push('instalou'),
      createUi: () => slow.ui,
      wait: clock.wait
    });
    await clock.advance(STARTUP_DOWNLOAD_MAX_MS + 10);
    expect(await longResult).toBe('open');

    const broken = fakeUi();
    const brokenResult = updateBeforeOpening({
      check: async () => ({ version: '3.2.0', download: Promise.reject(new Error('caiu')) }),
      install: () => broken.log.push('instalou'),
      createUi: () => broken.ui,
      wait: fakeClock().wait
    });
    expect(await brokenResult).toBe('open');
    expect([...slow.log, ...broken.log]).not.toContain('instalou');
  });

  it('aberto escondido (sem janelinha): instala do mesmo jeito', async () => {
    const clock = fakeClock();
    const log: string[] = [];
    const result = updateBeforeOpening({
      check: async () => ({ version: '3.2.0', download: Promise.resolve() }),
      install: () => log.push('instalou'),
      createUi: () => null,
      wait: clock.wait
    });
    await clock.advance(10);
    expect(await result).toBe('installing');
    expect(log).toEqual(['instalou']);
  });
});

describe('instalar sozinho com o app aberto', () => {
  const ready = { downloaded: true, windowVisible: false, gameRunning: false, uptimeMs: QUIET_INSTALL_MIN_UPTIME_MS };

  it('na bandeja, sem jogo aberto e com a versão baixada: instala', () => {
    expect(canInstallQuietly(ready)).toBe(true);
  });

  it('nunca com jogo aberto, com a janela na tela, sem download ou logo depois de abrir', () => {
    expect(canInstallQuietly({ ...ready, gameRunning: true })).toBe(false);
    expect(canInstallQuietly({ ...ready, windowVisible: true })).toBe(false);
    expect(canInstallQuietly({ ...ready, downloaded: false })).toBe(false);
    expect(canInstallQuietly({ ...ready, uptimeMs: 30_000 })).toBe(false);
  });
});
