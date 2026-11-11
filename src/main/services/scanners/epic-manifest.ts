import { readFile } from 'fs/promises';
import { inflateSync } from 'zlib';

// Lê o executável de um manifesto binário da Epic (.egstore/<id>.manifest).
// O launcher novo (com.epicgames.eglv2) não guarda mais o LaunchExecutable em JSON: só esse arquivo tem.
// Formato (o mesmo que ferramentas como o Legendary leem): cabeçalho com tamanho e compressão,
// depois FManifestMeta com appName, buildVersion, launchExe e launchCommand em FString.

const MANIFEST_MAGIC = 0x44bec00c;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

export interface EpicManifestMeta {
  appName: string;
  buildVersion: string;
  launchExe: string;
  launchCommand: string;
}

class Reader {
  constructor(
    private buf: Buffer,
    public pos = 0
  ) {}
  u8(): number {
    return this.buf.readUInt8(this.pos++);
  }
  u32(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  i32(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  // FString da Unreal: tamanho positivo = ASCII com \0; negativo = UTF-16 com \0
  fstring(): string {
    const length = this.i32();
    if (length === 0) return '';
    if (Math.abs(length) > 4096) throw new Error('texto grande demais no manifesto');
    if (length > 0) {
      const s = this.buf.toString('latin1', this.pos, this.pos + length - 1);
      this.pos += length;
      return s;
    }
    const bytes = -length * 2;
    const s = this.buf.toString('utf16le', this.pos, this.pos + bytes - 2);
    this.pos += bytes;
    return s;
  }
}

export function parseEpicManifest(file: Buffer): EpicManifestMeta | null {
  if (file.length < 41 || file.readUInt32LE(0) !== MANIFEST_MAGIC) return null;
  const header = new Reader(file, 4);
  const headerSize = header.u32();
  header.u32(); // tamanho descomprimido
  const compressedSize = header.u32();
  header.pos += 20; // SHA-1
  const storedAs = header.u8();
  let data = file.subarray(headerSize, headerSize + compressedSize);
  if (storedAs & 0x1) data = inflateSync(data);
  if (storedAs & 0x2) return null; // criptografado: não dá para ler

  const meta = new Reader(data);
  meta.u32(); // tamanho do bloco
  meta.u8(); // versão do bloco
  meta.u32(); // feature level
  meta.u8(); // é arquivo de dados
  meta.u32(); // appId
  const appName = meta.fstring();
  const buildVersion = meta.fstring();
  const launchExe = meta.fstring();
  const launchCommand = meta.fstring();
  return { appName, buildVersion, launchExe, launchCommand };
}

export async function readEpicManifest(path: string): Promise<EpicManifestMeta | null> {
  const file = await readFile(path);
  if (file.length > MAX_MANIFEST_BYTES) return null;
  return parseEpicManifest(file);
}
