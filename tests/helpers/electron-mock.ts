import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Dublê do Electron para os testes do main. O estado fica em globalThis porque os testes recarregam
// os módulos (vi.resetModules) e este arquivo é avaliado de novo a cada vez.

interface FakeElectronState {
  userData: string;
  encryptionAvailable: boolean;
  keyId: string;                    // "Chave do Windows": trocar simula a pasta de dados aberta em outro PC
  staleKeys: boolean;               // O sistema pede para cifrar de novo com a chave atual
  dirs: string[];
}

const globalState = globalThis as unknown as { __lazuliumFakeElectron?: FakeElectronState };
export const fake: FakeElectronState = (globalState.__lazuliumFakeElectron ??= { userData: '', encryptionAvailable: true, keyId: 'pc-1', staleKeys: false, dirs: [] });

export function resetFakeElectron(): void {
  fake.userData = '';
  fake.encryptionAvailable = true;
  fake.keyId = 'pc-1';
  fake.staleKeys = false;
}

// Pasta de dados nova e vazia para um teste (apagada no fim)
export function useTempUserData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lazulium-test-'));
  fake.dirs.push(dir);
  fake.userData = dir;
  return dir;
}

export function cleanupTestDirs(): void {
  for (const dir of fake.dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

const cipherPrefix = () => `cifrado-${fake.keyId}:`;

export const app = {
  getPath: (_name: string) => {
    if (!fake.userData) throw new Error('Teste sem pasta de dados: chame useTempUserData() antes');
    return fake.userData;
  },
  getVersion: () => '0.0.0-teste',
  getName: () => 'Lazulium',
  isPackaged: false,
  on: () => app,
  whenReady: () => Promise.resolve()
};

export const safeStorage = {
  isAsyncEncryptionAvailable: async () => fake.encryptionAvailable,
  encryptStringAsync: async (plain: string) => Buffer.from(cipherPrefix() + plain, 'utf-8'),
  decryptStringAsync: async (encrypted: Buffer) => {
    const text = encrypted.toString('utf-8');
    if (!text.startsWith(cipherPrefix())) throw new Error('Cifrado com outra chave');
    return { result: text.slice(cipherPrefix().length), shouldReEncrypt: fake.staleKeys };
  }
};

// O que os serviços importam mas os testes não exercitam
export const net = { fetch: () => Promise.reject(new Error('Sem rede nos testes')) };
export const shell = {};
export const dialog = {};
export const ipcMain = { handle: () => undefined, on: () => undefined };
export const nativeImage = {};
export const Notification = class {};
export const BrowserWindow = class {
  static getAllWindows = () => [];
};
