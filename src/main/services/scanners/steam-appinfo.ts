import { readFile } from 'fs/promises';
import { join } from 'path';

// appcache/appinfo.vdf: cache do cliente da Steam com nome e tipo de cada app que a conta conhece.
// Permite nomear jogos desinstalados sem internet e sem chave de API.
// Formatos: 0x07564428 (chaves em texto) e 0x07564429 (chaves numa tabela de strings no fim do arquivo).
const MAGIC_V28 = 0x07564428;
const MAGIC_V29 = 0x07564429;
// appid(4) + tamanho(4) vêm antes; depois: infoState(4) lastUpdated(4) token(8) sha1(20) changeNumber(4) binarySha1(20)
const APP_HEADER_BYTES = 8;
const APP_METADATA_BYTES = 60;

export interface SteamAppInfo {
  name: string;
  type: string;                     // game, application, tool, demo, dlc...
}

type VdfNode = { [key: string]: VdfNode | string | number };

function readStringTable(buf: Buffer): string[] {
  let i = Number(buf.readBigInt64LE(8));
  const count = buf.readUInt32LE(i);
  i += 4;
  const strings: string[] = [];
  for (let n = 0; n < count; n++) {
    const start = i;
    while (buf[i] !== 0) i++;
    strings.push(buf.toString('utf8', start, i++));
  }
  return strings;
}

function parseAppNode(buf: Buffer, start: number, end: number, strings?: string[]): VdfNode {
  let i = start;
  const readString = () => {
    const from = i;
    while (i < end && buf[i] !== 0) i++;
    return buf.toString('utf8', from, i++);
  };
  const readKey = () => {
    if (!strings) return readString();
    const key = strings[buf.readUInt32LE(i)];
    i += 4;
    return key;
  };
  const readObject = (): VdfNode => {
    const obj: VdfNode = {};
    while (i < end) {
      const type = buf[i++];
      if (type === 0x08) return obj;
      const key = readKey();
      if (type === 0x00) obj[key] = readObject();
      else if (type === 0x01) obj[key] = readString();
      else if (type === 0x02) {
        obj[key] = buf.readUInt32LE(i);
        i += 4;
      } else if (type === 0x07) i += 8;
      else throw new Error(`Tipo desconhecido: ${type}`);
    }
    return obj;
  };
  return readObject();
}

export function parseAppInfo(buf: Buffer): Map<string, SteamAppInfo> {
  const apps = new Map<string, SteamAppInfo>();
  const magic = buf.readUInt32LE(0);
  if (magic !== MAGIC_V28 && magic !== MAGIC_V29) return apps;

  const strings = magic === MAGIC_V29 ? readStringTable(buf) : undefined;
  let pos = magic === MAGIC_V29 ? 16 : 8;
  while (pos + APP_HEADER_BYTES <= buf.length) {
    const appId = buf.readUInt32LE(pos);
    if (appId === 0) break;
    const end = pos + APP_HEADER_BYTES + buf.readUInt32LE(pos + 4);
    try {
      const node = parseAppNode(buf, pos + APP_HEADER_BYTES + APP_METADATA_BYTES, end, strings);
      const common = (node.appinfo as VdfNode | undefined)?.common as VdfNode | undefined;
      if (typeof common?.name === 'string') {
        apps.set(String(appId), { name: common.name, type: String(common.type ?? '').toLowerCase() });
      }
    } catch {
      // Um app ilegível não impede os outros
    }
    pos = end;
  }
  return apps;
}

// Formato novo ou arquivo ausente: mapa vazio (os nomes vêm da loja da Steam depois)
export async function readSteamAppInfo(steamPath: string): Promise<Map<string, SteamAppInfo>> {
  try {
    return parseAppInfo(await readFile(join(steamPath, 'appcache', 'appinfo.vdf')));
  } catch (err) {
    console.warn('[Scanner:Steam] Não foi possível ler o appinfo.vdf:', (err as Error).message);
    return new Map();
  }
}
