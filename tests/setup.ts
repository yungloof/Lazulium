import { afterEach, beforeEach, vi } from 'vitest';
import { cleanupTestDirs, resetFakeElectron } from './helpers/electron-mock';

// O processo main importa 'electron' em quase todo arquivo: nos testes entra o dublê
vi.mock('electron', () => import('./helpers/electron-mock'));

beforeEach(() => {
  resetFakeElectron();
  // Os serviços registram bastante coisa no console; nos testes só interessa o que falha
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanupTestDirs();
});
