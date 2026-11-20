import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessInfo } from '../../src/main/services/tracker/process-snapshot';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';

// Nada de PowerShell nem taskkill de verdade: a lista de processos e o encerramento são dublês
const snapshot = vi.hoisted(() => ({ list: [] as ProcessInfo[] }));
vi.mock('../../src/main/services/tracker/process-snapshot', () => ({
  processSnapshot: {
    query: async () => snapshot.list,
    stop: () => undefined,
    stopWhenIdle: () => undefined,
    getLastGamepadInputAt: () => 0
  }
}));
const killed = vi.hoisted(() => [] as string[]);
vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: (_cmd: string, args: string[], _opts: unknown, done: () => void) => {
    killed.push(args[1]);
    done();
  }
}));
// Abertura que demora (comando antes de abrir, launcher): o teste segura até chamar open()
const launchGate = vi.hoisted(() => ({ pending: null as Promise<void> | null }));
vi.mock('../../src/main/services/tracker/launcher.service', () => ({
  LaunchError: class extends Error {},
  launchGame: async () => {
    if (launchGate.pending) await launchGate.pending;
    return { method: 'uri', launchedAt: Date.now() };
  },
  runGameCommand: async () => undefined
}));

import {
  CONFIRM_POLL_MS,
  END_GRACE_MS,
  HANDOFF_GRACE_MS,
  HANDOFF_WINDOW_MS,
  LAUNCH_POLL_MS,
  ProcessMonitor
} from '../../src/main/services/tracker/process-monitor.service';

const DIR = 'D:\\Jogos\\Epic\\Fortnite';
const T0 = 1_800_000_000_000;
const MIN = 60_000;

const proc = (pid: number, ppid: number, path: string | undefined, createdAt = T0): ProcessInfo => ({ pid, ppid, path, createdAt });
const inDir = (exe: string) => `${DIR}\\${exe}`;

function makeMonitor() {
  const events: string[] = [];
  const ended: { start: number; end: number }[] = [];
  const monitor = new ProcessMonitor({
    onDetected: (id) => events.push(`detected:${id}`),
    onHeartbeat: () => undefined,
    onEnded: (id, start, end) => {
      events.push(`ended:${id}`);
      ended.push({ start, end });
    },
    onNotDetected: (id) => events.push(`notDetected:${id}`)
  });
  // Jogo aberto por URI (Steam/Epic): sem PID raiz, reconhecido pela pasta
  monitor.watch({ id: 'jogo', matchDirs: [DIR], launchedAt: T0, startTimeoutMs: 3 * MIN });
  return { monitor, events, ended };
}

beforeEach(() => {
  // Só para os timers internos do monitor não dispararem: os testes chamam evaluate direto
  vi.useFakeTimers();
  snapshot.list = [];
  killed.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('monitor de processos: quando o jogo fecha', () => {
  it('jogo aberto há tempo: encerra poucos segundos depois de fechar, não um minuto', () => {
    const { monitor, events, ended } = makeMonitor();
    const game = [proc(100, 4, inDir('Game.exe'))];
    monitor.evaluate(game, T0 + 2_000);
    monitor.evaluate(game, T0 + 10 * MIN);

    const closed = T0 + 10 * MIN + 3_000;
    monitor.evaluate([], closed);
    monitor.evaluate([], closed + CONFIRM_POLL_MS);
    expect(events).not.toContain('ended:jogo');
    monitor.evaluate([], closed + END_GRACE_MS);
    expect(events).toContain('ended:jogo');
    // Fim no meio do caminho entre a última olhada que viu o jogo e a primeira que não viu
    expect(ended[0].end).toBe(T0 + 10 * MIN + 1_500);
    expect(END_GRACE_MS).toBeLessThanOrEqual(5_000);
  });

  it('no começo, tolera o launcher fechar antes do jogo abrir', () => {
    const { monitor, events } = makeMonitor();
    monitor.evaluate([proc(100, 4, inDir('FortniteLauncher.exe'))], T0 + 2_000);
    // Launcher fechou; o jogo leva 10 s para aparecer
    monitor.evaluate([], T0 + 20_000);
    monitor.evaluate([], T0 + 25_000);
    monitor.evaluate([], T0 + 29_000);
    monitor.evaluate([proc(200, 4, inDir('FortniteClient-Win64-Shipping.exe'), T0 + 29_500)], T0 + 30_000);
    expect(events).toEqual(['detected:jogo']);
    expect(HANDOFF_GRACE_MS).toBeGreaterThan(10_000);
    expect(monitor.isWatching('jogo')).toBe(true);
  });

  it('jogo com anticheat (processo sem caminho visível) segue contando pela árvore do launcher', () => {
    const { monitor, events } = makeMonitor();
    const launcher = proc(100, 4, inDir('FortniteLauncher.exe'));
    const protectedGame = proc(300, 100, undefined);
    monitor.evaluate([launcher, protectedGame], T0 + 2_000);
    // O launcher fecha e só o jogo protegido fica: continua sendo o jogo
    for (let t = T0 + HANDOFF_WINDOW_MS; t < T0 + HANDOFF_WINDOW_MS + 30_000; t += CONFIRM_POLL_MS) {
      monitor.evaluate([protectedGame], t);
    }
    expect(events).toEqual(['detected:jogo']);
    expect(monitor.getAlivePids('jogo')).toEqual([300]);
  });

  it('jogo que travou ao fechar (relatório de erro do Windows aberto) conta como fechado', () => {
    const { monitor, events } = makeMonitor();
    const game = proc(100, 4, inDir('Game.exe'));
    monitor.evaluate([game], T0 + 2_000);
    const crashedAt = T0 + 10 * MIN;
    const crash = [game, proc(500, 100, 'C:\\Windows\\System32\\WerFault.exe', crashedAt)];
    monitor.evaluate(crash, crashedAt);
    monitor.evaluate(crash, crashedAt + END_GRACE_MS);
    expect(events).toContain('ended:jogo');
    // O jogo travado não é adotado de novo enquanto o relatório termina
    expect(monitor.withoutReleased(crash)).toEqual([]);
  });

  it('PID reaproveitado pelo Windows (outra data de criação) não mantém a sessão', () => {
    const { monitor, events } = makeMonitor();
    monitor.evaluate([proc(100, 4, inDir('Game.exe'))], T0 + 2_000);
    const reused = [proc(100, 4, 'C:\\Program Files\\Outro\\outro.exe', T0 + 20 * MIN)];
    monitor.evaluate(reused, T0 + 20 * MIN);
    monitor.evaluate(reused, T0 + 20 * MIN + END_GRACE_MS);
    expect(events).toContain('ended:jogo');
  });

  it('Parar: libera os processos na hora e eles não voltam a contar como o jogo', () => {
    const { monitor } = makeMonitor();
    const game = [proc(100, 4, inDir('Game.exe')), proc(101, 100, inDir('Helper.exe'))];
    monitor.evaluate(game, T0 + 2_000);
    expect(monitor.release('jogo').sort()).toEqual([100, 101]);
    expect(monitor.isWatching('jogo')).toBe(false);

    // Jogando de novo enquanto o antigo ainda fecha: só o processo novo é o jogo
    expect(monitor.withoutReleased([...game, proc(700, 4, inDir('Game.exe'), T0 + 5 * MIN)]).map((p) => p.pid)).toEqual([700]);
    // Quando o processo antigo some, a trava acaba (o Windows pode reaproveitar o PID)
    expect(monitor.withoutReleased([]).length).toBe(0);
    expect(monitor.withoutReleased(game)).toHaveLength(2);
  });

  it('jogo que nunca apareceu desiste depois do tempo de espera', () => {
    const { monitor, events } = makeMonitor();
    monitor.evaluate([], T0 + LAUNCH_POLL_MS);
    monitor.evaluate([], T0 + 3 * MIN + 1);
    expect(events).toEqual(['notDetected:jogo']);
  });
});

describe('botão Parar', () => {
  type Service = typeof import('../../src/main/services/tracker/playtime.service');
  let playtime: Service['playtimeService'];
  let db: typeof import('../../src/main/database/db')['db'];

  beforeEach(async () => {
    vi.useRealTimers();
    useTempUserData();
    vi.resetModules();
    ({ db } = await import('../../src/main/database/db'));
    await db.init();
    db.upsertGames([makeGame({ id: 'epic-fn', platform: 'epic', installPath: DIR, launchUri: 'com.epicgames.launcher://apps/fn?action=launch' })]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(T0);
    ({ playtimeService: playtime } = await import('../../src/main/services/tracker/playtime.service'));
  });

  it('encerra a sessão na hora, conta o tempo até o clique e fecha os processos', async () => {
    const statuses: { state: string; sessionSeconds?: number }[] = [];
    playtime.setStatusListener((s) => statuses.push(s));
    playtime.startExternalTracking();
    await playtime.launch('epic-fn');
    expect(playtime.getState('epic-fn')).toBe('launching');

    snapshot.list = [proc(100, 4, inDir('FortniteLauncher.exe'), T0 + 1_000), proc(300, 100, undefined, T0 + 1_500)];
    await vi.advanceTimersByTimeAsync(LAUNCH_POLL_MS);
    expect(playtime.getState('epic-fn')).toBe('running');

    // Meia hora depois o jogo fecha, mas o processo protegido demora a sair: o jogador clica Parar
    await vi.advanceTimersByTimeAsync(30 * MIN);
    await playtime.stop('epic-fn');
    expect(playtime.getState('epic-fn')).toBe('stopped');
    expect(statuses.at(-1)).toMatchObject({ state: 'stopped' });
    expect(statuses.at(-1)!.sessionSeconds).toBeGreaterThanOrEqual(30 * 60);
    expect(killed.sort()).toEqual(['100', '300']);

    // O processo que o Windows não deixou fechar não reabre a sessão sozinho
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(playtime.getState('epic-fn')).toBe('stopped');
    playtime.shutdown();
  });

  it('cancela enquanto ainda está iniciando, sem contar tempo', async () => {
    const statuses: { state: string; cancelled?: boolean }[] = [];
    playtime.setStatusListener((s) => statuses.push(s));
    await playtime.launch('epic-fn');
    await playtime.stop('epic-fn');
    expect(playtime.getState('epic-fn')).toBe('stopped');
    expect(statuses.at(-1)).toMatchObject({ state: 'stopped', cancelled: true });
    expect(db.getPlaytimeSessions('epic-fn')).toEqual([]);
    playtime.shutdown();
  });

  it('Jogar logo depois de Cancelar aproveita a abertura que ainda estava em andamento', async () => {
    snapshot.list = [];
    let open!: () => void;
    launchGate.pending = new Promise<void>((resolve) => (open = resolve));
    const statuses: { state: string; cancelled?: boolean }[] = [];
    playtime.setStatusListener((s) => statuses.push(s));
    playtime.startExternalTracking();

    const first = playtime.launch('epic-fn');
    expect(statuses.at(-1)).toMatchObject({ state: 'launching' });
    await playtime.stop('epic-fn');
    expect(statuses.at(-1)).toMatchObject({ state: 'stopped', cancelled: true });

    // O segundo clique não some: volta a mostrar Iniciando e a abertura em andamento segue valendo
    expect(await playtime.launch('epic-fn')).toBe(true);
    expect(statuses.at(-1)).toMatchObject({ state: 'launching' });
    open();
    launchGate.pending = null;
    await first;
    snapshot.list = [proc(100, 4, inDir('FortniteLauncher.exe'), T0 + 1_000)];
    await vi.advanceTimersByTimeAsync(LAUNCH_POLL_MS);
    expect(playtime.getState('epic-fn')).toBe('running');
    playtime.shutdown();
  });

  it('Cancelar durante a abertura não deixa o jogo contar quando ele aparece', async () => {
    snapshot.list = [];
    let open!: () => void;
    launchGate.pending = new Promise<void>((resolve) => (open = resolve));
    playtime.startExternalTracking();
    const first = playtime.launch('epic-fn');
    await playtime.stop('epic-fn');
    open();
    launchGate.pending = null;
    await first;
    snapshot.list = [proc(100, 4, inDir('FortniteLauncher.exe'), T0 + 1_000)];
    await vi.advanceTimersByTimeAsync(LAUNCH_POLL_MS);
    expect(playtime.getState('epic-fn')).toBe('stopped');
    playtime.shutdown();
  });
});
