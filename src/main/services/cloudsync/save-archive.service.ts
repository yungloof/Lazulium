import { app } from 'electron';
import { createHash } from 'crypto';
import { mkdir, readFile, utimes, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve, sep } from 'path';
import { promisify } from 'util';
import { unzip, zip, Unzipped, Zippable } from 'fflate';
import { SaveLocation } from '@shared/types/cloudsync';
import { MAX_SAVE_BYTES, MAX_SAVE_FILES, SaveFile, collectSaveFiles } from './save-locator.service';

const zipAsync = promisify(zip) as (data: Zippable, opts: { level: 6 }) => Promise<Uint8Array>;
const unzipAsync = promisify(unzip) as (data: Uint8Array) => Promise<Unzipped>;

const MANIFEST_NAME = 'lazulium-manifest.json';
const MANIFEST_VERSION = 1;

interface ManifestRoot {
  index: number;
  path: string;                     // Com tokens ({DOCUMENTS}\...) para restaurar em outro PC/usuário
  filePrefix?: string;
}

interface ManifestFile {
  root: number;
  rel: string;
  size: number;
  mtimeMs: number;
  sha256: string;
}

interface SaveManifest {
  version: number;
  gameId: string;
  gameTitle: string;
  createdAt: string;
  roots: ManifestRoot[];
  files: ManifestFile[];
}

export interface BuiltArchive {
  data: Uint8Array;
  sha256: string;
  contentHash: string;
  fileCount: number;
}

export interface RestoreEntry {
  targetPath: string;
  data: Uint8Array;
  mtimeMs: number;
}

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// Pastas do usuário trocadas por tokens; a mais específica vence (Documentos antes de USERPROFILE)
function pathTokens(): [string, string][] {
  const tokens: [string, string][] = [
    ['{DOCUMENTS}', app.getPath('documents')],
    ['{APPDATA}', app.getPath('appData')],
    ['{LOCALAPPDATA}', process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')],
    ['{USERPROFILE}', homedir()]
  ];
  return tokens.sort((a, b) => b[1].length - a[1].length);
}

function tokenizePath(path: string): string {
  const full = resolve(path);
  for (const [token, dir] of pathTokens()) {
    const base = resolve(dir);
    if (full.toLowerCase() === base.toLowerCase()) return token;
    if (full.toLowerCase().startsWith(base.toLowerCase() + sep)) return token + full.slice(base.length);
  }
  return full;
}

function expandPath(path: string): string {
  for (const [token, dir] of pathTokens()) {
    if (path.startsWith(token)) return resolve(dir + path.slice(token.length));
  }
  return resolve(path);
}

export async function buildArchive(
  gameId: string,
  gameTitle: string,
  locations: SaveLocation[]
): Promise<BuiltArchive | null> {
  const roots: ManifestRoot[] = [];
  const collected: { root: number; file: SaveFile }[] = [];
  for (const [index, location] of locations.entries()) {
    roots.push({ index, path: tokenizePath(location.path), filePrefix: location.filePrefix });
    for (const file of await collectSaveFiles(location)) collected.push({ root: index, file });
  }
  if (collected.length === 0) return null;

  const totalBytes = collected.reduce((sum, c) => sum + c.file.size, 0);
  if (collected.length >= MAX_SAVE_FILES || totalBytes > MAX_SAVE_BYTES) {
    throw new Error(
      `Pasta de saves grande demais (${collected.length} arquivos, ${Math.round(totalBytes / 1024 / 1024)} MB). Revise as pastas configuradas.`
    );
  }

  const entries: Zippable = {};
  const files: ManifestFile[] = [];
  for (const { root, file } of collected) {
    let data: Uint8Array;
    try {
      data = await readFile(file.absPath);
    } catch (err) {
      // Arquivo bloqueado ou removido durante o backup: segue com os demais (no log, o caminho sem o nome do usuário do Windows)
      console.warn(`[SaveArchive] Ignorando ${tokenizePath(file.absPath)}: ${(err as NodeJS.ErrnoException).code ?? 'erro de leitura'}`);
      continue;
    }
    entries[`r${root}/${file.relPath}`] = data;
    files.push({ root, rel: file.relPath, size: data.byteLength, mtimeMs: file.mtimeMs, sha256: sha256(data) });
  }
  if (files.length === 0) return null;

  const manifest: SaveManifest = {
    version: MANIFEST_VERSION,
    gameId,
    gameTitle,
    createdAt: new Date().toISOString(),
    roots,
    files
  };
  entries[MANIFEST_NAME] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  const contentHash = createHash('sha256')
    .update(files.map((f) => `${roots[f.root].path}|${f.rel}|${f.sha256}`).sort().join('\n'))
    .digest('hex');
  const data = await zipAsync(entries, { level: 6 });
  return { data, sha256: sha256(data), contentHash, fileCount: files.length };
}

// Valida o .zip (hash de cada arquivo e caminhos) antes de qualquer escrita em disco
export async function readArchive(data: Uint8Array, expectedGameId: string): Promise<RestoreEntry[]> {
  let unzipped: Unzipped;
  try {
    unzipped = await unzipAsync(data);
  } catch {
    throw new Error('Backup inválido: o arquivo .zip está danificado.');
  }
  const manifestRaw = unzipped[MANIFEST_NAME];
  if (!manifestRaw) throw new Error('Backup inválido: manifesto ausente.');

  let manifest: SaveManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as SaveManifest;
  } catch {
    throw new Error('Backup inválido: manifesto danificado.');
  }
  if (manifest?.version !== MANIFEST_VERSION) throw new Error(`Versão de backup não suportada (${manifest?.version}).`);
  if (manifest.gameId !== expectedGameId) throw new Error('Este backup pertence a outro jogo.');
  if (!Array.isArray(manifest.roots) || !Array.isArray(manifest.files)) throw new Error('Backup inválido: manifesto incompleto.');

  const rootPaths = new Map(manifest.roots.map((r) => [r.index, expandPath(r.path)]));
  return manifest.files.map((file) => {
    const rootPath = rootPaths.get(file.root);
    const entry = unzipped[`r${file.root}/${file.rel}`];
    if (!rootPath || !entry) throw new Error(`Backup incompleto: ${file.rel}`);
    if (sha256(entry) !== file.sha256) throw new Error(`Backup corrompido: ${file.rel}`);

    const targetPath = resolve(rootPath, file.rel);
    if (isAbsolute(file.rel) || file.rel.split('/').includes('..') || !targetPath.startsWith(rootPath + sep)) {
      throw new Error(`Caminho inválido no backup: ${file.rel}`);
    }
    return { targetPath, data: entry, mtimeMs: file.mtimeMs };
  });
}

// Sobrescreve os arquivos do backup; arquivos extras na pasta de destino são mantidos
export async function writeRestoreEntries(entries: RestoreEntry[]): Promise<void> {
  for (const entry of entries) {
    await mkdir(dirname(entry.targetPath), { recursive: true });
    await writeFile(entry.targetPath, entry.data);
    const mtime = new Date(entry.mtimeMs);
    await utimes(entry.targetPath, mtime, mtime).catch(() => undefined);
  }
}
