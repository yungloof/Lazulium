export const NAV_AUDIO_SETTING_KEYS = {
  enabled: 'navigationSoundEnabled',
  volume: 'navigationSoundVolume'
} as const;

export interface NavAudioSettings {
  enabled: boolean;
  volume: number; // 0..100
}

export function parseNavAudioSettings(settings?: Record<string, string>): NavAudioSettings {
  const rawEnabled = settings?.[NAV_AUDIO_SETTING_KEYS.enabled];
  const enabled = rawEnabled === undefined || rawEnabled === '' ? true : rawEnabled === 'true';
  const rawVolume = Number(settings?.[NAV_AUDIO_SETTING_KEYS.volume]);
  const volume = Number.isFinite(rawVolume) ? Math.max(0, Math.min(100, Math.round(rawVolume))) : 100;
  return { enabled, volume };
}

interface ToneStep {
  type?: OscillatorType;
  fromFreq: number;
  toFreq?: number;
  duration: number;
  gain: number;
  delay?: number;
}

// Sintetizador de efeitos sonoros sutis de navegação e cerimônias via Web Audio API (sem arquivos externos)
class NavigationAudio {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 1;

  protected getContext(): AudioContext | null {
    if (!this.enabled || this.volume <= 0) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setVolume(percent: number) {
    if (!Number.isFinite(percent)) return;
    this.volume = Math.max(0, Math.min(100, Math.round(percent))) / 100;
  }

  public getVolume(): number {
    return Math.round(this.volume * 100);
  }

  protected playSteps(steps: ToneStep[]) {
    const ctx = this.getContext();
    if (!ctx) return;

    const baseTime = ctx.currentTime;
    try {
      for (const step of steps) {
        const start = baseTime + (step.delay ?? 0);
        const end = start + step.duration;
        const startGain = Math.max(0.0002, step.gain * this.volume);
        const endGain = Math.min(0.001, startGain * 0.05);

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = step.type ?? 'sine';
        osc.frequency.setValueAtTime(step.fromFreq, start);
        if (step.toFreq && step.toFreq !== step.fromFreq) {
          osc.frequency.exponentialRampToValueAtTime(step.toFreq, end);
        }

        gain.gain.setValueAtTime(startGain, start);
        gain.gain.exponentialRampToValueAtTime(endGain, end);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(end);
      }
    } catch {
      // AudioContext não liberado pelo navegador ainda
    }
  }

  /**
   * Clique suave ao mover o foco entre jogos ou abas
   */
  public playMove() {
    this.playSteps([{ type: 'sine', fromFreq: 420, toFreq: 260, duration: 0.035, gain: 0.04 }]);
  }

  /**
   * Som de confirmação ao selecionar ou abrir detalhes
   */
  public playSelect() {
    this.playSteps([{ type: 'triangle', fromFreq: 520, toFreq: 880, duration: 0.07, gain: 0.06 }]);
  }

  /**
   * Som sutil ao voltar ou fechar modal
   */
  public playBack() {
    this.playSteps([{ type: 'sine', fromFreq: 480, toFreq: 300, duration: 0.05, gain: 0.05 }]);
  }

  /**
   * Som de estrelinha / favorito
   */
  public playFavorite() {
    this.playSteps([
      { type: 'sine', fromFreq: 780, duration: 0.08, gain: 0.05, delay: 0 },
      { type: 'sine', fromFreq: 1170, duration: 0.08, gain: 0.05, delay: 0.03 }
    ]);
  }

  /**
   * Som ao alternar abas de filtro (LB / RB)
   */
  public playTab() {
    this.playSteps([{ type: 'sine', fromFreq: 380, toFreq: 460, duration: 0.03, gain: 0.04 }]);
  }

  /**
   * Som curto de conquista desbloqueada
   */
  public playAchievement() {
    this.playSteps([
      { type: 'triangle', fromFreq: 659.25, duration: 0.09, gain: 0.06, delay: 0 },
      { type: 'triangle', fromFreq: 830.61, duration: 0.1, gain: 0.065, delay: 0.07 },
      { type: 'sine', fromFreq: 987.77, duration: 0.22, gain: 0.07, delay: 0.14 }
    ]);
  }

  /**
   * Som de celebração para Zerado e 100%
   */
  public playCeremonyComplete() {
    this.playSteps([
      { type: 'triangle', fromFreq: 523.25, duration: 0.1, gain: 0.06, delay: 0 },
      { type: 'triangle', fromFreq: 659.25, duration: 0.1, gain: 0.065, delay: 0.08 },
      { type: 'triangle', fromFreq: 783.99, duration: 0.12, gain: 0.07, delay: 0.16 },
      { type: 'sine', fromFreq: 1046.5, duration: 0.28, gain: 0.075, delay: 0.24 }
    ]);
  }
}

export const navAudio = new NavigationAudio();

export function applyNavAudioSettings(settings?: Record<string, string>): NavAudioSettings {
  const parsed = parseNavAudioSettings(settings);
  navAudio.setEnabled(parsed.enabled);
  navAudio.setVolume(parsed.volume);
  return parsed;
}
