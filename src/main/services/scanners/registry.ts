import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const REG_TIMEOUT_MS = 8_000;
const VALUE_LINE = /^\s+(\S.*?)\s+(REG_\w+)\s*(.*)$/;
const HIVES: Record<string, string> = {
  HKLM: 'HKEY_LOCAL_MACHINE',
  HKCU: 'HKEY_CURRENT_USER',
  HKCR: 'HKEY_CLASSES_ROOT',
  HKU: 'HKEY_USERS',
  HKCC: 'HKEY_CURRENT_CONFIG'
};

// Nome completo e em minúsculas para comparar chaves ("HKLM\..." e "HKEY_LOCAL_MACHINE\..." são a mesma)
function keyId(key: string): string {
  const [hive, ...rest] = key.replace(/\\+$/, '').split('\\');
  return [HIVES[hive.toUpperCase()] ?? hive, ...rest].join('\\').toLowerCase();
}

const parentId = (key: string) => keyId(key).replace(/\\[^\\]*$/, '');

// O reg.exe responde na página de código OEM do console (850 no Brasil): acentos e nomes em outros
// alfabetos viravam "�", e caminhos como C:\Users\João\... não eram achados. Com chcp 65001 vem em UTF-8.
// Chave inexistente: o reg sai com código 1 e a promessa rejeita.
async function regQuery(args: string[]): Promise<string> {
  const command = ['reg', 'query', ...args.map((a) => (a.startsWith('/') ? a : `"${a}"`))].join(' ');
  const { stdout } = await execFileAsync('cmd.exe', ['/d', '/s', '/c', `"chcp 65001 >nul & ${command}"`], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    timeout: REG_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout;
}

// Valores por chave, na ordem da saída do reg (nomes dos valores em minúsculas)
function parseKeys(stdout: string): Map<string, Record<string, string>> {
  const keys = new Map<string, Record<string, string>>();
  let current: Record<string, string> | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) {
      current = {};
      keys.set(line.trim(), current);
      continue;
    }
    const match = current && line.match(VALUE_LINE);
    if (match) current![match[1].toLowerCase()] = match[3].trim();
  }
  return keys;
}

// Lê um valor REG_SZ/REG_EXPAND_SZ do registro do Windows.
// Retorna undefined se a chave/valor não existir ou fora do Windows.
export async function readRegistryValue(key: string, valueName: string): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined;
  try {
    for (const line of (await regQuery([key, '/v', valueName])).split(/\r?\n/)) {
      const match = line.match(VALUE_LINE);
      if (match && match[1].toLowerCase() === valueName.toLowerCase()) return match[3].trim() || undefined;
    }
  } catch {
    // Chave ou valor inexistente
  }
  return undefined;
}

// Lista os caminhos completos das subchaves imediatas.
export async function listRegistrySubkeys(key: string): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  try {
    const parent = keyId(key);
    // Com valores próprios, o reg também imprime a chave pedida: ela não é subchave
    return [...parseKeys(await regQuery([key])).keys()].filter((k) => keyId(k) !== parent);
  } catch {
    return [];
  }
}

// Lê todos os valores de uma chave do registro em um único comando
export async function readRegistryKeyValues(key: string): Promise<Record<string, string>> {
  if (process.platform !== 'win32') return {};
  try {
    const wanted = keyId(key);
    for (const [name, values] of parseKeys(await regQuery([key]))) {
      if (keyId(name) === wanted) return values;
    }
  } catch {
    // Chave inexistente
  }
  return {};
}

// Valores de todas as subchaves imediatas de uma vez (um processo só, em vez de um por subchave)
export async function readRegistrySubkeyValues(key: string): Promise<Map<string, Record<string, string>>> {
  const result = new Map<string, Record<string, string>>();
  if (process.platform !== 'win32') return result;
  try {
    const parent = keyId(key);
    for (const [name, values] of parseKeys(await regQuery([key, '/s']))) {
      if (parentId(name) === parent) result.set(name, values);
    }
  } catch {
    // Chave inexistente
  }
  return result;
}
