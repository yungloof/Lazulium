import { create } from 'zustand';
import { ReactionSummary, ReactionTarget, SocialNotifications } from '@shared/types/social';
import { reactionKey } from '@shared/utils/reactions';

// Curtidas e comentários: as contagens de cada resenha/lista na tela (pedidas juntas, uma vez) e os avisos

const BATCH_DELAY_MS = 60;

interface ReactionsState {
  me: string | null;                              // Sua conta Lazulium (null = sem conta)
  summaries: Record<string, ReactionSummary>;
  notifications: SocialNotifications | null;

  setMe: (me: string | null) => void;
  request: (target: ReactionTarget) => void;
  setSummary: (target: ReactionTarget, summary: ReactionSummary) => void;
  setNotifications: (notifications: SocialNotifications) => void;
}

const queued = new Map<string, ReactionTarget>();
const asked = new Set<string>();                  // Já pedidas (ou pedindo): o servidor antigo não responde, então não insiste
let timer: ReturnType<typeof setTimeout> | undefined;

const flush = () => {
  timer = undefined;
  const targets = [...queued.values()];
  queued.clear();
  if (targets.length === 0) return;
  window.electronAPI
    ?.socialGetReactions(targets)
    .then((items) => useReactionsStore.setState((s) => ({ summaries: { ...s.summaries, ...items } })))
    .catch(() => undefined);
};

export const useReactionsStore = create<ReactionsState>((set, get) => ({
  me: null,
  summaries: {},
  notifications: null,

  setMe: (me) => {
    if (me === get().me) return;
    asked.clear();
    set({ me, summaries: {}, notifications: me ? get().notifications : null });
  },
  request: (target) => {
    if (!get().me) return;
    const key = reactionKey(target);
    if (asked.has(key)) return;
    asked.add(key);
    queued.set(key, target);
    if (!timer) timer = setTimeout(flush, BATCH_DELAY_MS);
  },
  setSummary: (target, summary) => set((s) => ({ summaries: { ...s.summaries, [reactionKey(target)]: summary } })),
  setNotifications: (notifications) => set({ notifications })
}));

// Abrir a aba de novo busca as contagens atualizadas
export const forgetReactions = (): void => asked.clear();
