import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { dirname } from 'path';
import { powerMonitor, shell } from 'electron';
import { Game } from '@shared/types/game';
import { GameLaunchState, GameLaunchStatus } from '@shared/types/ipc';
import { db } from '../../database/db';
import { LaunchError, launchGame, runGameCommand } from './launcher.service';
import { ProcessMonitor } from './process-monitor.service';
import { processSnapshot } from './process-snapshot';

const MIN_SESSION_SECONDS = 15;
const HEARTBEAT_PERSIST_MS = 60_000;
// Steam/Epic podem precisar atualizar ou sincronizar antes de abrir o jogo
const URI_START_TIMEOUT_MS = 3 * 60_000;
const SPAWN_START_TIMEOUT_MS = 60_000;
// Jogos abertos por fora (launcher da Epic, atalho do jogo): uma olhada por minuto nos programas abertos
const EXTERNAL_SCAN_MS = 60_000;
const EXTERNAL_FIRST_SCAN_MS = 30_000;
export const TRACK_EXTERNAL_SETTING = 'trackExternalGames';

type StatusListener = (status: GameLaunchStatus) => void;

interface ActiveGame {
  state: Exclude<GameLaunchState, 'stopped'>;
  startedAt?: number;
  lastPersistAt: number;
  lastPollAt: number;
  idleSeconds: number;               // segundos ausentes acumulados acima do limite
}

// Limite configurado pelo usuário para considerar ausente (em segundos)
function getIdleThresholdSeconds(): number {
  const settings = db.getSettings();
  if (settings.discountIdleTime === 'false') return 0;
  const mins = Number(settings.idleThresholdMinutes ?? '15');
  if (isNaN(mins) || mins <= 0) return 0;
  return mins * 60;
}

// Segundos desde a última atividade: teclado/mouse (Windows) ou controle (XInput).
export function secondsSinceLastInput(systemIdleSeconds: number, lastGamepadInputAt: number, now: number): number {
  if (lastGamepadInputAt <= 0) return systemIdleSeconds;
  return Math.min(systemIdleSeconds, Math.max(0, (now - lastGamepadInputAt) / 1000));
}

// Pastas cujos executáveis representam o jogo. Emuladores ficam de fora: a pasta
// do emulador casaria com instâncias abertas manualmente; rastreamos pela árvore de PIDs.
// Atalho aberto pela Steam não tem PID: só resta a pasta do próprio emulador.
function getMatchDirs(game: Game, spawned: boolean): string[] {
  if (game.platform === 'emulator') return !spawned && game.launchUri && game.executablePath ? [dirname(game.executablePath)] : [];
  const dir = game.installPath || game.workingDirectory || (spawned && game.executablePath ? dirname(game.executablePath) : '');
  return dir ? [dir] : [];
}

const normalizeDir = (dir: string) => dir.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() + '\\';

// Jogos que podem ser reconhecidos abertos por fora. Ficam de fora: Steam (a própria Steam conta e o Lazulium importa),
// emuladores (o mesmo programa abre vários jogos), registros do Diário e pastas largas demais (que contêm outro jogo,
// ou com menos de duas pastas abaixo do disco, como "D:\Jogos").
export function externalCandidates(games: Game[]): { game: Game; dir: string }[] {
  const list = games
    .filter((g) => g.isInstalled !== false && !g.manualEntry && !g.isHidden && g.platform !== 'steam' && g.platform !== 'emulator')
    .flatMap((game) => {
      const raw = game.installPath || game.workingDirectory || (game.executablePath ? dirname(game.executablePath) : '');
      if (!raw) return [];
      const dir = normalizeDir(raw);
      return dir.split('\\').filter(Boolean).length >= 3 ? [{ game, dir }] : [];
    });
  return list.filter(({ dir }) => !list.some((other) => other.dir !== dir && other.dir.startsWith(dir)));
}

// Erro de abertura em português claro, com o que o jogador pode fazer
function launchErrorMessage(err: unknown, game: Game): string {
  if (err instanceof LaunchError) return err.message;
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return `O executável de ${game.title} não foi encontrado. Ele pode ter sido movido ou apagado: clique em Escanear ou edite o jogo.`;
  if (code === 'EACCES' || code === 'EPERM')
    return `O Windows não deixou abrir ${game.title}. O jogo pode pedir para rodar como administrador ou ter sido bloqueado pelo antivírus.`;
  if (game.launchUri && /^(steam|com\.epicgames|goggalaxy):/i.test(game.launchUri))
    return `O lançador de ${game.title} não abriu. Confira se ele está instalado e tente de novo.`;
  return `Não foi possível abrir ${game.title}. Veja o motivo no log (Configurações → Abrir pasta de logs).`;
}

class PlaytimeService {
  private listener: StatusListener = () => {};
  private active = new Map<string, ActiveGame>();
  private launching = new Set<string>();
  private externalTimer: NodeJS.Timeout | undefined;
  private scanningExternal = false;

  private monitor = new ProcessMonitor({
    onDetected: (id, pid, firstSeenAt) => {
      const entry = this.active.get(id);
      if (!entry) return;
      entry.state = 'running';
      entry.startedAt = firstSeenAt;
      entry.lastPersistAt = Date.now();
      entry.lastPollAt = Date.now();
      entry.idleSeconds = 0;
      db.setActiveSession({ gameId: id, startedAt: firstSeenAt, lastSeenAt: firstSeenAt, idleSeconds: 0 });
      console.log(`[Playtime] ${id} em execução (PID ${pid})`);
      this.emit({ gameId: id, state: 'running', isRunning: true, pid, startTime: new Date(firstSeenAt).toISOString() });
    },

    onHeartbeat: (id, lastSeenAt) => {
      const entry = this.active.get(id);
      if (!entry?.startedAt) return;

      const thresholdSeconds = getIdleThresholdSeconds();
      const now = Date.now();
      const dt = Math.min(Math.max(0, (now - (entry.lastPollAt || now)) / 1000), 10);
      entry.lastPollAt = now;

      // Se passou do limite sem teclado, mouse ou controle, acumula tempo ausente
      if (thresholdSeconds > 0) {
        try {
          const idle = secondsSinceLastInput(powerMonitor.getSystemIdleTime(), processSnapshot.getLastGamepadInputAt(), now);
          if (idle > thresholdSeconds) {
            entry.idleSeconds += dt;
          }
        } catch {
          // powerMonitor pode falhar em ambientes de teste sem display
        }
      }

      if (lastSeenAt - entry.lastPersistAt < HEARTBEAT_PERSIST_MS) return;
      entry.lastPersistAt = lastSeenAt;
      db.setActiveSession({
        gameId: id,
        startedAt: entry.startedAt,
        lastSeenAt,
        idleSeconds: Math.round(entry.idleSeconds)
      });
    },

    onEnded: (id, firstSeenAt, lastSeenAt) => this.finish(id, firstSeenAt, lastSeenAt),

    onNotDetected: (id) => {
      this.active.delete(id);
      console.warn(`[Playtime] ${id}: processo do jogo não detectado`);
      this.emit({
        gameId: id,
        state: 'stopped',
        isRunning: false,
        error: 'O jogo não apareceu na lista de programas abertos, então esse tempo não foi contado.'
      });
    }
  });

  getAlivePids(gameId: string): number[] {
    return this.monitor.getAlivePids(gameId);
  }

  setStatusListener(listener: StatusListener): void {
    this.listener = listener;
  }

  getState(gameId: string): GameLaunchState {
    return this.active.get(gameId)?.state ?? 'stopped';
  }

  async launch(gameId: string): Promise<boolean> {
    const game = db.getGameById(gameId);
    if (!game) return false;
    // Clique duplo (ou A repetido no controle) enquanto o primeiro lançamento ainda não terminou:
    // sem esta trava os dois passavam pela verificação e o jogo abria duas vezes
    if (this.active.has(gameId) || this.launching.has(gameId)) return true;
    this.launching.add(gameId);
    try {
      return await this.launchUnlocked(game);
    } finally {
      this.launching.delete(gameId);
    }
  }

  private async launchUnlocked(game: Game): Promise<boolean> {
    const gameId = game.id;
    // Desinstalado: a Steam oferece a instalação; nos outros casos só informa
    if (game.isInstalled === false || game.manualEntry) {
      if (game.platform === 'steam' && game.platformGameId) {
        try {
          await shell.openExternal(`steam://install/${game.platformGameId}`);
          return true;
        } catch (err) {
          console.warn(`[Playtime] steam://install de ${game.title} falhou:`, (err as Error).message);
          this.emit({ gameId, state: 'stopped', isRunning: false, error: 'A Steam não abriu para instalar o jogo. Confira se ela está instalada neste PC.' });
          return false;
        }
      }
      this.emit({
        gameId,
        state: 'stopped',
        isRunning: false,
        error: game.manualEntry
          ? 'Este jogo foi registrado à mão no Diário e não é aberto pelo Lazulium.'
          : 'Este jogo não está instalado. Reinstale-o e clique em Escanear: o histórico continua guardado.'
      });
      return false;
    }

    let handle;
    try {
      handle = await launchGame(game);
    } catch (err) {
      console.error(`[Playtime] Falha ao lançar ${game.title}:`, err);
      this.emit({ gameId, state: 'stopped', isRunning: false, error: launchErrorMessage(err, game) });
      return false;
    }

    const matchDirs = getMatchDirs(game, handle.method === 'spawn');
    if (handle.pid === undefined && matchDirs.length === 0) {
      this.emit({
        gameId,
        state: 'stopped',
        isRunning: false,
        error: 'O jogo abriu, mas sem a pasta de instalação não dá para contar o tempo.'
      });
      return true;
    }

    this.active.set(gameId, { state: 'launching', lastPersistAt: 0, lastPollAt: Date.now(), idleSeconds: 0 });
    this.monitor.watch({
      id: gameId,
      rootPid: handle.pid,
      matchDirs,
      launchedAt: handle.launchedAt,
      startTimeoutMs: handle.method === 'uri' ? URI_START_TIMEOUT_MS : SPAWN_START_TIMEOUT_MS
    });
    this.emit({ gameId, state: 'launching', isRunning: false });
    return true;
  }

  // Conta também os jogos abertos sem passar pelo Lazulium (Epic, GOG, atalho na área de trabalho...)
  startExternalTracking(): void {
    if (this.externalTimer) return;
    const tick = () => void this.scanExternal().catch((err) => console.warn('[Playtime] Procura de jogos abertos falhou:', (err as Error).message));
    setTimeout(tick, EXTERNAL_FIRST_SCAN_MS).unref();
    this.externalTimer = setInterval(tick, EXTERNAL_SCAN_MS);
    this.externalTimer.unref();
  }

  private async scanExternal(): Promise<void> {
    if (this.scanningExternal || db.getSettings()[TRACK_EXTERNAL_SETTING] === 'false') return;
    const candidates = externalCandidates(db.getGames()).filter(({ game }) => !this.active.has(game.id) && !this.launching.has(game.id));
    if (candidates.length === 0) return;
    this.scanningExternal = true;
    try {
      const list = await processSnapshot.query();
      for (const { game, dir } of candidates) {
        const matched = list.filter((p) => p.path && p.path.toLowerCase().startsWith(dir));
        if (matched.length === 0 || this.active.has(game.id) || this.launching.has(game.id)) continue;
        // Começo da sessão = o processo mais antigo do jogo (pode ter aberto antes desta olhada)
        const startedAt = Math.min(Date.now(), ...matched.map((p) => p.createdAt ?? Date.now()));
        console.log(`[Playtime] ${game.title} aberto fora do Lazulium: contando o tempo`);
        this.active.set(game.id, { state: 'launching', lastPersistAt: 0, lastPollAt: Date.now(), idleSeconds: 0 });
        this.monitor.watch({ id: game.id, matchDirs: [dir], launchedAt: startedAt, startTimeoutMs: SPAWN_START_TIMEOUT_MS });
      }
    } finally {
      this.scanningExternal = false;
      // Sem jogo sendo acompanhado, o PowerShell da consulta não precisa ficar aberto
      if (!this.monitor.hasWatches()) processSnapshot.stop();
    }
  }

  // Encerra a árvore de processos detectada; o monitor registra o fim da sessão
  async stop(gameId: string): Promise<boolean> {
    const pids = this.monitor.getAlivePids(gameId);
    if (pids.length === 0) return false;
    await Promise.all(
      pids.map(
        (pid) =>
          new Promise<void>((resolve) =>
            execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve())
          )
      )
    );
    return true;
  }

  // Sessões que ficaram abertas porque o app fechou/travou durante o jogo
  recoverInterruptedSessions(): void {
    for (const record of db.getActiveSessions()) {
      this.record(record.gameId, record.startedAt, record.lastSeenAt, record.idleSeconds ?? 0);
      console.log(`[Playtime] Sessão interrompida recuperada: ${record.gameId}`);
    }
  }

  // Chamado no encerramento do app: conta o tempo até agora e para o polling
  shutdown(): void {
    const now = Date.now();
    for (const [id, entry] of this.active) {
      if (entry.startedAt !== undefined) {
        this.record(id, entry.startedAt, now, entry.idleSeconds);
      }
    }
    this.active.clear();
    clearInterval(this.externalTimer);
    this.monitor.stopAll();
  }

  private finish(id: string, startedAt: number, endedAt: number): void {
    const entry = this.active.get(id);
    const idle = entry?.idleSeconds ?? 0;
    this.active.delete(id);
    const { seconds, idleDiscounted, game } = this.record(id, startedAt, endedAt, idle);
    console.log(
      `[Playtime] ${id} encerrado após ${seconds}s líquidas (${idleDiscounted}s ausente descontados)${
        seconds < MIN_SESSION_SECONDS ? ' (descartado)' : ''
      }`
    );
    const closed = db.getGameById(id);
    if (closed?.postExitCommand) void runGameCommand(closed.postExitCommand, closed, 'Comando depois de fechar');
    this.emit({
      gameId: id,
      state: 'stopped',
      isRunning: false,
      sessionSeconds: seconds >= MIN_SESSION_SECONDS ? seconds : 0,
      idleSeconds: idleDiscounted > 0 ? idleDiscounted : undefined,
      game: game ?? undefined
    });
  }

  private record(
    gameId: string,
    startedAt: number,
    endedAt: number,
    accumulatedIdle: number = 0
  ): { seconds: number; idleDiscounted: number; game: Game | null } {
    db.removeActiveSession(gameId);
    const wallClockSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
    const idleDiscounted = Math.min(wallClockSeconds, Math.round(accumulatedIdle));
    const seconds = Math.max(0, wallClockSeconds - idleDiscounted);

    if (seconds < MIN_SESSION_SECONDS) return { seconds, idleDiscounted, game: db.getGameById(gameId) };

    const game = db.addPlaytimeSession({
      id: randomUUID(),
      gameId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationSeconds: seconds,
      idleSeconds: idleDiscounted > 0 ? idleDiscounted : undefined
    });
    return { seconds, idleDiscounted, game };
  }

  private emit(status: GameLaunchStatus): void {
    try {
      this.listener(status);
    } catch (err) {
      console.warn('[Playtime] Falha ao notificar status:', err);
    }
  }
}

export const playtimeService = new PlaytimeService();
