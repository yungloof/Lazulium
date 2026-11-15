import { app, shell } from 'electron';
import { CallAnswer, CallAnswerNotice, CallEvent, IncomingCall, SocialFriend } from '@shared/types/social';
import { CALL_ANSWER_TEXT, CALL_CHAOS_SECONDS, decideCallDelivery, friendPresence, parseCallSettings } from '@shared/utils/presence';
import { db } from '../../database/db';
import { notify } from '../../app-shell';
import { playtimeService } from '../tracker/playtime.service';
import { socialService } from './social.service';
import { presenceService } from './presence.service';
import { OverlayAnswer, closeCallOverlay, showCallOverlay } from './call-overlay';

// "Chamar pra call": manda a chamada, busca as que chegaram e as respostas, e decide como cada uma aparece
// (tela doida, notificação, só aviso no app ou recusa sozinha).
// Consulta rápida só quando algum amigo está on-line: ninguém consegue chamar com o app fechado.
// Quem pergunta ao servidor é o poll.service (um pedido só para chamadas, amigos e avisos); aqui fica o ritmo.

const POLL_FAST_MS = Number(process.env.LAZULIUM_CALL_POLL_MS) || 15_000;
// Ninguém aparece on-line: quem chama pode estar Invisível, então ainda olha a cada minuto. Sem amigos, ninguém pode chamar.
const POLL_SLOW_MS = 60_000;
const POLL_NO_FRIENDS_MS = 5 * 60_000;
const FAST_AFTER_CALL_MS = 3 * 60_000;       // Depois de chamar, espera a resposta com pressa
const PENDING_MAX_AGE_MS = 6 * 60 * 60_000;  // Chamada sem resposta some do app depois disso
const UUID = /^[0-9a-f-]{36}$/;

export interface CallsPoll {
  incoming?: IncomingCall[];
  answers?: CallAnswerNotice[];
}

class CallsService {
  private friendsOnline = false;
  private hasFriends = true;
  private fastUntil = 0;
  private wake: (ms: number) => void = () => {};
  private pending = new Map<string, IncomingCall>();
  private listener: (event: CallEvent) => void = () => {};

  setListener(listener: (event: CallEvent) => void): void {
    this.listener = listener;
  }

  // O poll.service diz como adiantar a próxima consulta de chamadas
  setWake(wake: (ms: number) => void): void {
    this.wake = wake;
  }

  init(): void {
    socialService.onFriends((friends: SocialFriend[]) => {
      const online = friends.some((f) => friendPresence(f) !== 'offline');
      if ((online && !this.friendsOnline) || (friends.length > 0 && !this.hasFriends)) this.wake(1_000);
      this.friendsOnline = online;
      this.hasFriends = friends.length > 0;
    });
  }

  nextDelay(): number {
    if (this.friendsOnline || Date.now() < this.fastUntil) return POLL_FAST_MS;
    return this.hasFriends ? POLL_SLOW_MS : POLL_NO_FRIENDS_MS;
  }

  // Resposta da consulta (a única ou a rota antiga /v1/calls)
  apply(result: CallsPoll | undefined): void {
    for (const call of result?.incoming ?? []) this.receive(call);
    for (const notice of result?.answers ?? []) this.receiveAnswer(notice);
  }

  // Saiu da conta: o que esperava resposta não vale mais
  disconnected(): void {
    this.pending.clear();
  }

  async callFriend(friendId: string): Promise<{ id: string; createdAt: string }> {
    if (!UUID.test(friendId)) throw new Error('Amigo inválido.');
    const result = await socialService.api<{ call: { id: string; createdAt: string } }>('POST', '/v1/calls', { to: friendId });
    this.fastUntil = Date.now() + FAST_AFTER_CALL_MS;
    this.wake(POLL_FAST_MS);
    return result.call;
  }

  getPending(): IncomingCall[] {
    const cutoff = Date.now() - PENDING_MAX_AGE_MS;
    for (const [id, call] of this.pending) if (Date.parse(call.createdAt) < cutoff) this.pending.delete(id);
    return [...this.pending.values()];
  }

  async answer(callId: string, answer: CallAnswer): Promise<void> {
    if (!UUID.test(callId)) throw new Error('Chamada inválida.');
    closeCallOverlay(callId);
    await socialService.api('POST', `/v1/calls/${callId}/answer`, { answer });
    this.pending.delete(callId);
    this.listener({ kind: 'answered', callId, answer });
    if (answer === 'yes') this.openDiscord();
  }

  // Só deixa de lado (fechou sem responder): continua na lista do app
  dismiss(callId: string): void {
    closeCallOverlay(callId);
  }

  // Botão "Testar" das configurações: a própria tela doida, sem avisar ninguém
  test(): void {
    const settings = parseCallSettings(db.getSettings());
    const me = socialService.getStatus().user;
    showCallOverlay(
      { id: 'test', name: me?.name ?? 'Seu amigo', avatarUrl: me?.avatarUrl ?? null },
      { volume: settings.volume, chaosSeconds: CALL_CHAOS_SECONDS, test: true },
      () => undefined
    );
  }

  private receive(call: IncomingCall): void {
    const settings = parseCallSettings(db.getSettings());
    const delivery = decideCallDelivery(settings, {
      presence: presenceService.getState().effective,
      gameRunning: playtimeService.isAnyRunning(),
      missed: call.missed
    });
    if (delivery === 'decline') {
      void socialService.api('POST', `/v1/calls/${call.id}/answer`, { answer: 'busy' }).catch(() => undefined);
      return;
    }
    this.pending.set(call.id, call);
    this.listener({ kind: 'incoming', call, how: delivery });
    if (delivery === 'notify') notify(`${call.from.name} tá te chamando pra call no Discord! 📞`, 'Abra o Lazulium para responder.');
    if (delivery === 'chaos') {
      showCallOverlay(
        { id: call.id, name: call.from.name, avatarUrl: call.from.avatarUrl },
        { volume: settings.volume, chaosSeconds: CALL_CHAOS_SECONDS },
        (answer: OverlayAnswer) => {
          if (answer === 'none') return;
          void this.answer(call.id, answer).catch((err) => console.warn('[Calls] Resposta não enviada:', (err as Error).message));
        }
      );
    }
  }

  private receiveAnswer(notice: CallAnswerNotice): void {
    this.listener({ kind: 'answer', notice });
    notify(notice.user.name, CALL_ANSWER_TEXT[notice.answer] ?? 'Respondeu a sua chamada');
  }

  // "Tô indo!" leva para o Discord, quando ele está instalado e a pessoa quer
  private openDiscord(): void {
    if (!parseCallSettings(db.getSettings()).openDiscord) return;
    try {
      if (!app.getApplicationNameForProtocol('discord://')) return;
      void shell.openExternal('discord://-/channels/@me').catch(() => undefined);
    } catch {
      // Sem Discord: só responde
    }
  }
}

export const callsService = new CallsService();
