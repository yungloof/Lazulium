import { describe, expect, it } from 'vitest';
import { applyNavAudioSettings, navAudio, parseNavAudioSettings } from '../../src/renderer/src/utils/navigationAudio';

describe('som de navegação', () => {
  it('começa ligado a 100% quando não há configuração salva', () => {
    expect(parseNavAudioSettings(undefined)).toEqual({ enabled: true, volume: 100 });
    expect(parseNavAudioSettings({})).toEqual({ enabled: true, volume: 100 });
  });

  it('limita o volume entre 0 e 100 e respeita a chave desligada', () => {
    expect(parseNavAudioSettings({ navigationSoundEnabled: 'false', navigationSoundVolume: '45' })).toEqual({
      enabled: false,
      volume: 45
    });
    expect(parseNavAudioSettings({ navigationSoundVolume: '180' }).volume).toBe(100);
    expect(parseNavAudioSettings({ navigationSoundVolume: '-20' }).volume).toBe(0);
    expect(parseNavAudioSettings({ navigationSoundVolume: 'abc' }).volume).toBe(100);
  });

  it('aplica a configuração no sintetizador global', () => {
    applyNavAudioSettings({ navigationSoundEnabled: 'false', navigationSoundVolume: '35' });
    expect(navAudio.isEnabled()).toBe(false);
    expect(navAudio.getVolume()).toBe(35);

    applyNavAudioSettings({ navigationSoundEnabled: 'true', navigationSoundVolume: '80' });
    expect(navAudio.isEnabled()).toBe(true);
    expect(navAudio.getVolume()).toBe(80);
  });
});
