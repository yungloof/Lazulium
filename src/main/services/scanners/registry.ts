import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Lê um valor REG_SZ/REG_EXPAND_SZ do registro do Windows via `reg query`.
// Retorna undefined se a chave/valor não existir ou fora do Windows.
export async function readRegistryValue(key: string, valueName: string): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined;
  try {
    const { stdout } = await execFileAsync('reg', ['query', key, '/v', valueName], {
      windowsHide: true,
      timeout: 5000
    });
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^\s+(\S.*?)\s+(REG_\w+)\s+(.*)$/);
      if (match && match[1].toLowerCase() === valueName.toLowerCase()) {
        return match[3].trim() || undefined;
      }
    }
  } catch {
    // Chave inexistente: `reg` sai com código 1
  }
  return undefined;
}

// Lista os caminhos completos das subchaves imediatas via `reg query <key>`.
export async function listRegistrySubkeys(key: string): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('reg', ['query', key], {
      windowsHide: true,
      timeout: 5000
    });
    const subkeys: string[] = [];
    const normalizedParent = key.toLowerCase().replace(/\\+$/, '');
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^HKEY_/i.test(line)) {
        const normalizedLine = line.toLowerCase().replace(/\\+$/, '');
        if (normalizedLine !== normalizedParent) {
          subkeys.push(line);
        }
      }
    }
    return subkeys;
  } catch {
    return [];
  }
}

// Lê todos os valores de uma chave do registro em um único comando
export async function readRegistryKeyValues(key: string): Promise<Record<string, string>> {
  if (process.platform !== 'win32') return {};
  try {
    const { stdout } = await execFileAsync('reg', ['query', key], {
      windowsHide: true,
      timeout: 5000
    });
    const values: Record<string, string> = {};
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^\s+(\S.*?)\s+(REG_\w+)\s*(.*)$/);
      if (match) {
        values[match[1].toLowerCase()] = match[3].trim();
      }
    }
    return values;
  } catch {
    return {};
  }
}
