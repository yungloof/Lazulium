import { powerMonitor } from 'electron';
import { PresenceState, PresenceStatus } from '@shared/types/social';
import { PRESENCE_SETTING_KEYS, effectivePresence, parsePresenceStatus } from '@shared/utils/presence';
import { db } from '../../database/db';
import { setDoNotDisturb, setTrayPresence } from '../../app-shell';
import { playtimeService } from '../tracker/playtime.service';
import { socialService } from './social.service';

// Status da conta Lazulium (como no Discord). A escolha fica nas configurações do PC; o servidor só guarda o que
// os amigos veem. A cada minuto confere o prazo e o Ausente automático (PC parado ou tela bloqueada).

const TICK_MS = 60_000;
const RESEND_MS = 30 * 60_000;   // Reenvia de vez em quando: outro PC da mesma conta pode ter trocado

class PresenceService {
  private locked = false;
  private state: PresenceState = { chosen: 'online', effective: 'online', auto: false };
  private sent: { key: string; at: number } | undefined;
  private sending = false;
  private listener: (state: PresenceState) => void = () => {};

  setListener(listener: (state: PresenceState) => void): void {
    this.listener = listener;
  }

  init(): void {
    try {
      powerMonitor.on('lock-screen', () => {
        this.locked = true;
        void this.tick();
      });
      powerMonitor.on('unlock-screen', () => {
        this.locked = false;
        void this.tick();
      });
      // Voltou da suspensão: o status antigo pode ter vencido
      powerMonitor.on('resume', () => void this.tick());
    } catch {
      // Sem powerMonitor (testes): só o relógio
    }
    setInterval(() => void this.tick(), TICK_MS).unref();
    setTimeout(() => void this.tick(), 3_000).unref();
  }

  getState(): PresenceState {
    return this.state;
  }

  async set(status: PresenceStatus, durationMs: number | null): Promise<PresenceState> {
    const chosen = parsePresenceStatus(status);
    const until = chosen !== 'online' && durationMs && durationMs > 0 ? new Date(Date.now() + durationMs).toISOString() : '';
    db.setSetting(PRESENCE_SETTING_KEYS.status, chosen);
    db.setSetting(PRESENCE_SETTING_KEYS.until, until);
    await this.tick();
    return this.state;
  }

  private idleSeconds(): number {
    try {
      return powerMonitor.getSystemIdleTime();
    } catch {
      return 0;
    }
  }

  async tick(): Promise<void> {
    const settings = db.getSettings();
    const chosen = parsePresenceStatus(settings[PRESENCE_SETTING_KEYS.status]);
    const until = settings[PRESENCE_SETTING_KEYS.until] || undefined;
    const result = effectivePresence(chosen, until, { idleSeconds: this.idleSeconds(), locked: this.locked, gameRunning: playtimeService.isAnyRunning() });
    if (result.expired) {
      db.setSetting(PRESENCE_SETTING_KEYS.status, 'online');
      db.setSetting(PRESENCE_SETTING_KEYS.until, '');
    }
    const next: PresenceState = {
      chosen: result.expired ? 'online' : chosen,
      ...(result.expired || !until ? {} : { until }),
      effective: result.status,
      auto: result.auto
    };
    const previous = this.state;
    this.state = next;
    setDoNotDisturb(next.effective === 'dnd');
    if (JSON.stringify(previous) !== JSON.stringify(next)) this.listener(next);

    const connected = socialService.isConnected();
    setTrayPresence(connected ? { current: next.chosen, pick: (status) => void this.set(status, null) } : null);
    if (!connected) {
      this.sent = undefined;
      return;
    }
    await this.push(previous.effective === 'invisible' && next.effective !== 'invisible');
  }

  // Manda ao servidor só quando muda (ou de meia em meia hora); sem internet, tenta no próximo minuto
  private async push(leftInvisible: boolean): Promise<void> {
    const { effective, until, auto } = this.state;
    const body = { status: effective, ...(until && !auto ? { until } : {}), ...(auto ? { auto: true } : {}) };
    const key = JSON.stringify(body);
    if (this.sending || (this.sent?.key === key && Date.now() - this.sent.at < RESEND_MS)) return;
    this.sending = true;
    try {
      await socialService.api('PUT', '/v1/me/presence', body);
      this.sent = { key, at: Date.now() };
      if (leftInvisible) socialService.refreshNowPlaying();
    } catch (err) {
      console.warn('[Presence] Não foi possível enviar o status:', (err as Error).message);
    } finally {
      this.sending = false;
    }
  }
}

export const presenceService = new PresenceService();
