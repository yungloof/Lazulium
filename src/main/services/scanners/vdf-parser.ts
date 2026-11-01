// Parser minimalista para o formato KeyValues (VDF/ACF) da Valve.
// Chaves são normalizadas para minúsculas, pois a Valve alterna entre
// "LibraryFolders"/"libraryfolders", "StateFlags"/"stateflags", etc.

export interface VdfObject {
  [key: string]: string | VdfObject;
}

type Token = { type: 'string'; value: string } | { type: 'open' } | { type: 'close' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '﻿') {
      i++;
      continue;
    }

    // Comentários de linha
    if (ch === '/' && input[i + 1] === '/') {
      while (i < len && input[i] !== '\n') i++;
      continue;
    }

    if (ch === '{') {
      tokens.push({ type: 'open' });
      i++;
      continue;
    }

    if (ch === '}') {
      tokens.push({ type: 'close' });
      i++;
      continue;
    }

    if (ch === '"') {
      i++;
      let value = '';
      while (i < len && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < len) {
          const next = input[i + 1];
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
        } else {
          value += input[i++];
        }
      }
      i++; // aspas de fechamento
      tokens.push({ type: 'string', value });
      continue;
    }

    // Token sem aspas (raro, mas válido no formato)
    let value = '';
    while (i < len && !/[\s{}"]/.test(input[i])) value += input[i++];
    tokens.push({ type: 'string', value });
  }

  return tokens;
}

export function parseVdf(input: string): VdfObject {
  const tokens = tokenize(input);
  let pos = 0;

  const parseObject = (): VdfObject => {
    const obj: VdfObject = {};
    while (pos < tokens.length) {
      const token = tokens[pos++];
      if (token.type === 'close') return obj;
      if (token.type !== 'string') continue;

      const key = token.value.toLowerCase();
      const next = tokens[pos];
      if (!next) break;

      if (next.type === 'open') {
        pos++;
        obj[key] = parseObject();
      } else if (next.type === 'string') {
        pos++;
        obj[key] = next.value;
      }
    }
    return obj;
  };

  return parseObject();
}

export function vdfGetObject(obj: VdfObject | undefined, key: string): VdfObject | undefined {
  const value = obj?.[key.toLowerCase()];
  return typeof value === 'object' ? value : undefined;
}

export function vdfGetString(obj: VdfObject | undefined, key: string): string | undefined {
  const value = obj?.[key.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}
