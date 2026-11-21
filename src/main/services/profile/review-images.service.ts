// Imagens das resenhas (3.3): arquivos em userData/review-images, um por imagem, com o nome tirado do conteúdo
// (a mesma imagem duas vezes é um arquivo só). A tela mostra por lazulium-media://review/<id>.
//
// Saem do PC só com a conta Lazulium e quando precisam: resenhas compartilhadas com amigos/vitrine ou a
// sincronização entre PCs ligada. Cada imagem vai uma vez ao servidor e o endereço que volta fica guardado aqui.
// Outro PC da mesma pessoa, sem o arquivo, traz do servidor na primeira vez que a resenha aparece.
// Imagem que saiu de todas as resenhas fica 15 dias (dá para desfazer, e as cópias do banco são de 14 dias)
// e depois é apagada daqui e do servidor.
import { app, dialog, type BrowserWindow } from 'electron';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import type { ReviewImageSource } from '@shared/types/ipc';
import { MAX_REVIEW_IMAGE_BYTES, REVIEW_IMAGE_ID } from '@shared/utils/review-blocks';
import { db } from '../../database/db';
import { mediaUrl, registerMediaRoot } from '../metadata/media-cache.service';
import { httpRequest } from '../metadata/http';
import { screenshotsService } from '../metadata/screenshots.service';

const HOST = 'review';
const SETTING_KEY = 'reviewImages';
export const UNUSED_GRACE_MS = 15 * 86_400_000;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;       // Arquivo escolhido antes de reduzir
const MAX_UPLOADS_PER_RUN = 40;                  // O resto vai na próxima vez (o servidor limita pedidos por minuto)
const MAX_DELETES_PER_RUN = 40;
const LIST_REFRESH_MS = 60_000;
const FULL_RETRY_MS = 6 * 60 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif'
};

// O que o app sabe do servidor: de qual conta são os endereços, os endereços e desde quando cada imagem não está
// em nenhuma resenha
interface StoredState {
  account?: string;
  urls: Record<string, string>;
  unused: Record<string, number>;
  mine: Record<string, number>;     // Imagens que este PC já viu numa resenha (só essas ele apaga do servidor)
  sent?: Record<string, number>;    // Imagens que este PC mesmo enviou (só essas saem quando nada mais precisa delas)
}

// O que o serviço precisa da conta Lazulium (o social.service entrega: assim um não importa o outro)
export interface ReviewImagesRemote {
  accountId(): string | undefined;
  serverOrigin(): string;
  list(): Promise<{ id: string; url: string }[]>;
  put(id: string, base64: string): Promise<string>;
  remove(id: string): Promise<void>;
}

export function reviewImageKind(bytes: Uint8Array): 'webp' | 'gif' | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif';
  return null;
}

export function reviewImageIdOf(bytes: Uint8Array): string | null {
  const kind = reviewImageKind(bytes);
  return kind ? `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${kind}` : null;
}

// Ids de imagem em todas as resenhas: jogos escondidos também, e os registros que a sincronização trouxe de
// jogos que só existem em outro PC (a resenha é a mesma, só não aparece aqui)
export function referencedReviewImages(): Set<string> {
  const ids = new Set<string>();
  for (const game of db.getGames()) for (const image of game.log?.reviewImages ?? []) ids.add(image.id);
  for (const entry of Object.values(db.getSyncState().syncUnresolved?.games ?? {})) {
    for (const image of entry.log?.reviewImages ?? []) ids.add(image.id);
  }
  return ids;
}

class ReviewImagesService {
  private remote?: ReviewImagesRemote;
  private uploading: Promise<void> | null = null;
  private listedAt = 0;
  private fullUntil = 0;            // Espaço da conta cheio: espera antes de tentar enviar de novo
  private downloads = new Map<string, Promise<boolean>>();

  root(): string {
    return join(app.getPath('userData'), 'review-images');
  }

  register(): void {
    registerMediaRoot(HOST, { resolveRoot: () => this.root(), allowPath: REVIEW_IMAGE_ID, fetchMissing: (id) => this.fetchMissing(id) });
  }

  setRemote(remote: ReviewImagesRemote): void {
    this.remote = remote;
  }

  localUrl(id: string): string {
    return mediaUrl(HOST, id);
  }

  private state(): StoredState {
    try {
      const raw = JSON.parse(db.getSettings()[SETTING_KEY] || '{}') as Partial<StoredState>;
      return { account: raw.account, urls: raw.urls ?? {}, unused: raw.unused ?? {}, mine: raw.mine ?? {}, sent: raw.sent ?? {} };
    } catch {
      return { urls: {}, unused: {}, mine: {}, sent: {} };
    }
  }

  private save(state: StoredState): void {
    db.setSetting(SETTING_KEY, JSON.stringify(state));
  }

  // Endereço público da imagem (só depois de enviada, e só da conta conectada agora)
  publicUrl(id: string): string | undefined {
    const state = this.state();
    const account = this.remote?.accountId();
    return account && state.account === account ? state.urls[id] : undefined;
  }

  // ---------- Imagens novas ----------

  async pickFromPc(window: BrowserWindow | null): Promise<ReviewImageSource | null> {
    const options = {
      title: 'Escolher imagem para a resenha',
      properties: ['openFile' as const],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }]
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    return this.readSource(path);
  }

  async readScreenshot(gameId: string, screenshotId: string): Promise<ReviewImageSource> {
    const game = db.getGameById(gameId);
    const path = game ? await screenshotsService.resolvePath(game, screenshotId) : null;
    if (!path) throw new Error('Captura não encontrada.');
    return this.readSource(path);
  }

  private async readSource(path: string): Promise<ReviewImageSource> {
    const mime = MIME_BY_EXT[extname(path).toLowerCase()];
    if (!mime) throw new Error('Esse arquivo não é uma imagem que o Lazulium abre (PNG, JPG, WebP, GIF, BMP ou AVIF).');
    const info = await stat(path);
    if (info.size > MAX_SOURCE_BYTES) throw new Error('Imagem grande demais (até 40 MB).');
    const buffer = await readFile(path);
    return { fileName: path.split(/[\\/]/).pop() ?? 'imagem', mime, bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) };
  }

  // A tela já reduziu a imagem (WebP; GIF pequeno vai como está, animado)
  async saveImage(bytes: Uint8Array): Promise<{ id: string; url: string }> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_REVIEW_IMAGE_BYTES) throw new Error('Imagem grande demais para a resenha.');
    const id = reviewImageIdOf(bytes);
    if (!id) throw new Error('Formato de imagem inesperado.');
    await this.writeFile(id, bytes);
    return { id, url: this.localUrl(id) };
  }

  private async writeFile(id: string, bytes: Uint8Array): Promise<void> {
    const root = this.root();
    const target = join(root, id);
    if (existsSync(target)) return;
    await mkdir(root, { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, target);
  }

  // ---------- Outro PC: traz do servidor a imagem que veio pela sincronização ----------

  private fetchMissing(id: string): Promise<boolean> {
    if (!REVIEW_IMAGE_ID.test(id)) return Promise.resolve(false);
    let running = this.downloads.get(id);
    if (!running) {
      running = this.download(id)
        .catch((err) => {
          console.warn('[Resenha] Imagem não veio do servidor:', (err as Error).message);
          return false;
        })
        .finally(() => this.downloads.delete(id));
      this.downloads.set(id, running);
    }
    return running;
  }

  private async download(id: string): Promise<boolean> {
    const remote = this.remote;
    if (!remote?.accountId()) return false;
    let url = this.publicUrl(id);
    if (!url && Date.now() - this.listedAt > LIST_REFRESH_MS) {
      await this.refreshList();
      url = this.publicUrl(id);
    }
    // Só do servidor do Lazulium: o banco poderia ter sido mexido
    if (!url || new URL(url).origin !== new URL(remote.serverOrigin()).origin) return false;
    const res = await httpRequest(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS, service: 'o servidor do Lazulium' });
    if (!res.ok) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // O nome é o hash do conteúdo: confere que veio a imagem certa
    if (bytes.byteLength > MAX_REVIEW_IMAGE_BYTES || reviewImageIdOf(bytes) !== id) return false;
    await this.writeFile(id, bytes);
    return true;
  }

  private async refreshList(): Promise<void> {
    const remote = this.remote;
    const account = remote?.accountId();
    if (!remote || !account) return;
    const listed = await remote.list();
    this.listedAt = Date.now();
    const state = this.state();
    const urls: Record<string, string> = {};
    for (const item of listed) if (REVIEW_IMAGE_ID.test(item.id) && typeof item.url === 'string') urls[item.id] = item.url;
    const same = state.account === account;
    this.save({ ...state, account, urls, unused: same ? state.unused : {}, mine: same ? state.mine : {}, sent: same ? state.sent : {} });
  }

  // ---------- Envio e limpeza ----------

  // wanted: alguém vai ver as imagens (resenhas compartilhadas ou sincronização entre PCs ligada).
  // Com wanted, manda o que falta e apaga do servidor as deste PC que saíram de todas as resenhas há 15 dias.
  // Sem wanted, tira do servidor todas as que este PC usou: nada mais precisa delas lá.
  syncServer(wanted: boolean): Promise<void> {
    if (!this.uploading) {
      this.uploading = this.runServerSync(wanted).finally(() => (this.uploading = null));
    }
    return this.uploading;
  }

  private async runServerSync(wanted: boolean): Promise<void> {
    const remote = this.remote;
    const account = remote?.accountId();
    if (!remote || !account) return;
    // Quem nunca pôs imagem em resenha não pergunta nada ao servidor
    if (!wanted && referencedReviewImages().size === 0 && Object.keys(this.state().mine).length === 0) return;
    // Uma lista por abertura do app (e na troca de conta): o que outro PC já mandou não vai de novo
    if (this.state().account !== account || this.listedAt === 0) await this.refreshList();

    const used = referencedReviewImages();
    const state = this.state();
    // Só se apaga do servidor a imagem que este PC conhece de uma resenha: a de outro PC (sincronização
    // desligada, ou jogo que só existe lá) nunca é apagada daqui
    for (const id of used) state.mine[id] ??= Date.now();
    for (const id of Object.keys(state.unused)) if (used.has(id)) delete state.unused[id];

    let uploads = 0;
    const blocked = Date.now() < this.fullUntil;
    for (const id of wanted && !blocked ? used : []) {
      if (state.urls[id] || uploads >= MAX_UPLOADS_PER_RUN) continue;
      const path = join(this.root(), id);
      if (!existsSync(path)) continue;
      const bytes = await readFile(path);
      try {
        state.urls[id] = await remote.put(id, bytes.toString('base64'));
        (state.sent ??= {})[id] = Date.now();
        uploads++;
        this.save(state);
      } catch (err) {
        // Espaço da conta cheio ou imagem recusada: as outras seguem; a resenha aparece sem essa imagem para os amigos
        console.warn(`[Resenha] Imagem ${id} não foi enviada:`, (err as Error).message);
        if ((err as { status?: number }).status === 413) {
          this.fullUntil = Date.now() + FULL_RETRY_MS;
          break;
        }
      }
    }

    const now = Date.now();
    let deletes = 0;
    for (const id of Object.keys(state.urls)) {
      if (!state.mine[id] || deletes >= MAX_DELETES_PER_RUN) continue;
      // Sem ninguém para ver neste PC, sai só o que ele mesmo mandou: a enviada por outro PC pode ser
      // usada lá (sincronização ligada só no outro)
      if (!wanted && !state.sent?.[id]) continue;
      if (wanted) {
        if (used.has(id)) continue;
        const since = state.unused[id] ?? now;
        state.unused[id] = since;
        if (now - since < UNUSED_GRACE_MS) continue;
      }
      try {
        await remote.remove(id);
        delete state.urls[id];
        delete state.unused[id];
        if (state.sent) delete state.sent[id];
        deletes++;
      } catch (err) {
        console.warn(`[Resenha] Imagem ${id} não foi apagada do servidor:`, (err as Error).message);
      }
    }
    // Fora de todas as resenhas e fora do servidor: não há mais o que acompanhar
    for (const id of Object.keys(state.mine)) if (!used.has(id) && !state.urls[id]) delete state.mine[id];
    this.save(state);
  }

  // Arquivos deste PC que não estão em nenhuma resenha há 15 dias (roda ao abrir, sem pressa)
  async sweepLocal(): Promise<number> {
    const root = this.root();
    if (!existsSync(root)) return 0;
    const used = referencedReviewImages();
    const state = this.state();
    const now = Date.now();
    let removed = 0;
    for (const name of await readdir(root)) {
      const path = join(root, name);
      // Sobra de gravação interrompida
      if (name.endsWith('.tmp')) {
        const info = await stat(path).catch(() => null);
        if (info && now - info.mtimeMs > 86_400_000) await unlink(path).catch(() => undefined);
        continue;
      }
      if (!REVIEW_IMAGE_ID.test(name)) continue;
      if (used.has(name)) {
        delete state.unused[name];
        continue;
      }
      const since = state.unused[name] ?? now;
      state.unused[name] = since;
      if (now - since < UNUSED_GRACE_MS) continue;
      await unlink(path).catch(() => undefined);
      // Do servidor quem apaga é syncServer (precisa da conta); se nunca foi enviada, some daqui também
      if (!state.urls[name]) delete state.unused[name];
      removed++;
    }
    for (const id of Object.keys(state.unused)) if (used.has(id)) delete state.unused[id];
    this.save(state);
    return removed;
  }
}

export const reviewImagesService = new ReviewImagesService();
