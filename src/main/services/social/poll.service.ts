import { SocialFriend, SocialNotification } from '@shared/types/social';
import { socialService } from './social.service';
import { CallsPoll, callsService } from './calls.service';
import { reactionsService } from './reactions.service';
import { PollDue, PollPart, bringForward, nextTickIn, partsDue } from './poll-plan';

// Consulta de fundo da conta Lazulium: chamadas, amigos e avisos num pedido só (/v1/me/poll).
// Cada parte tem o seu ritmo (chamadas pelo calls.service; amigos e avisos a cada 90 s) e as que vencem
// perto uma da outra vão juntas. Servidor antigo, sem a rota: volta às rotas separadas.

const FRIENDS_POLL_MS = Number(process.env.LAZULIUM_SOCIAL_POLL_MS) || 90_000;   // A variável só serve para testes
const NOTIFICATIONS_POLL_MS = FRIENDS_POLL_MS;
const FIRST_CALLS_MS = 4_000;
const FIRST_FRIENDS_MS = 5_000;
const FIRST_NOTIFICATIONS_MS = 15_000;

interface PollResponse {
  calls?: CallsPoll;
  friends?: SocialFriend[];
  notifications?: SocialNotification[];
}

class PollService {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private legacy = false;
  private due: PollDue = { calls: 0, friends: 0, notifications: 0 };

  init(): void {
    const now = Date.now();
    this.due = { calls: now + FIRST_CALLS_MS, friends: now + FIRST_FRIENDS_MS, notifications: now + FIRST_NOTIFICATIONS_MS };
    callsService.setWake((ms) => this.wake('calls', ms));
    this.schedule();
  }

  wake(part: PollPart, ms: number): void {
    this.due = bringForward(this.due, part, Date.now(), ms);
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), nextTickIn(this.due, Date.now()));
    this.timer.unref();
  }

  private interval(part: PollPart): number {
    if (part === 'calls') return callsService.nextDelay();
    return part === 'friends' ? FRIENDS_POLL_MS : NOTIFICATIONS_POLL_MS;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const parts = partsDue(this.due, Date.now());
    try {
      if (parts.length === 0) return;
      if (!socialService.isConnected()) {
        callsService.disconnected();
        return;
      }
      await this.fetch(parts);
    } catch {
      // Sem internet ou servidor fora: tenta de novo no ritmo de sempre
    } finally {
      const now = Date.now();
      for (const part of parts) this.due[part] = now + this.interval(part);
      this.running = false;
      this.schedule();
    }
  }

  private async fetch(parts: PollPart[]): Promise<void> {
    const since = parts.includes('notifications') ? reactionsService.pollSince() : null;
    const wanted = parts.filter((part) => part !== 'notifications' || since !== null);
    if (!this.legacy) {
      const query = new URLSearchParams({ parts: wanted.join(',') });
      if (since) query.set('since', since);
      const { ok, status, data } = await socialService.apiRaw<PollResponse>('GET', `/v1/me/poll?${query}`);
      if (ok && data) return this.apply(data);
      if (status !== 404) throw new Error(`Consulta do servidor falhou (erro ${status}).`);
      this.legacy = true;
    }
    // Servidor sem /v1/me/poll: uma rota por parte, como antes
    if (wanted.includes('calls')) callsService.apply(await socialService.api<CallsPoll>('GET', '/v1/calls'));
    if (wanted.includes('friends')) await socialService.pollFriends();
    if (wanted.includes('notifications')) await reactionsService.poll();
  }

  private async apply(data: PollResponse): Promise<void> {
    if (data.calls) callsService.apply(data.calls);
    if (Array.isArray(data.friends)) await socialService.receiveFriends(data.friends);
    if (data.notifications) reactionsService.receive(data.notifications);
  }
}

export const pollService = new PollService();
