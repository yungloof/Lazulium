// Guarda de arquivos grandes do perfil (GIF e vídeo de fundo), em disco. Roda na VPS (media-server.mjs),
// porque o banco do servidor da conta (D1) só aceita 2 MB por valor.
// Não conhece contas nem tokens: só aceita envio ou pedido de apagar com bilhete assinado pelo servidor da conta.
// Um arquivo por conta e por tipo; enviar outro troca o anterior.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, rmdir, stat, statfs } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { verifyTicket } from './media-ticket.js';

const EXTENSION_BY_MIME = { 'image/gif': 'gif', 'video/webm': 'webm', 'video/mp4': 'mp4' };
const MIME_BY_EXTENSION = { gif: 'image/gif', webm: 'video/webm', mp4: 'video/mp4' };
const KINDS = ['background'];
const USER_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const FILE_PATH = /^\/media\/f\/([0-9a-f-]{36})\/(background-[A-Za-z0-9_-]{20,64}\.(gif|webm|mp4))$/;
const HEAD_BYTES = 12;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;   // O disco é o mesmo da API e dos instaladores: não enche até o fim

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

const bearer = (request) => {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

// O começo do arquivo precisa ser do tipo anunciado: nada de HTML ou programa com nome de vídeo
function looksLike(extension, head) {
  if (extension === 'gif') return /^GIF8[79]a/.test(head.toString('latin1'));
  if (extension === 'webm') return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  return head.subarray(4, 8).toString('latin1') === 'ftyp';
}

// "bytes=10-99", "bytes=10-" ou "bytes=-500". null = sem faixa (manda inteiro); 'invalid' = faixa fora do arquivo
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  const [, first, last] = match;
  if (!first && !last) return 'invalid';
  if (!first) {
    const suffix = Number(last);
    return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : 'invalid';
  }
  const start = Number(first);
  const end = last ? Math.min(Number(last), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : 'invalid';
}

export function createMediaStore({ dir, secret, publicOrigin, maxBytes = DEFAULT_MAX_BYTES, minFreeBytes = DEFAULT_MIN_FREE_BYTES }) {
  if (!dir || typeof secret !== 'string' || secret.length < 32) throw new Error('A guarda de arquivos precisa de uma pasta e de um segredo de 32 caracteres ou mais.');
  const origin = String(publicOrigin).replace(/\/+$/, '');

  const removeKind = async (userDir, kind, except) => {
    const names = await readdir(userDir).catch(() => []);
    await Promise.all(names.filter((name) => name.startsWith(`${kind}-`) && name !== except).map((name) => rm(join(userDir, name), { force: true })));
  };

  async function upload(request) {
    const ticket = await verifyTicket(secret, bearer(request));
    if (!ticket || ticket.a !== 'put' || !USER_ID.test(ticket.u) || !KINDS.includes(ticket.k)) return json({ error: 'unauthorized' }, 401);
    const extension = EXTENSION_BY_MIME[(request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase()];
    if (!extension || !request.body) return json({ error: 'invalid_media' }, 400);
    const limit = Math.min(maxBytes, ticket.m > 0 ? ticket.m : maxBytes);
    const announced = Number(request.headers.get('Content-Length') ?? 0);
    if (announced > limit) return json({ error: 'too_large' }, 413);
    await mkdir(dir, { recursive: true });
    if (minFreeBytes > 0) {
      const disk = await statfs(dir);
      if (disk.bavail * disk.bsize - limit < minFreeBytes) return json({ error: 'store_full' }, 507);
    }

    // Grava num arquivo temporário e só troca o anterior quando chegou inteiro e é do tipo certo
    const temp = join(dir, `.tmp-${randomBytes(12).toString('hex')}`);
    const out = createWriteStream(temp);
    let size = 0;
    let head = Buffer.alloc(0);
    let problem = null;
    try {
      for await (const chunk of request.body) {
        size += chunk.byteLength;
        if (size > limit) {
          problem = [413, 'too_large'];
          break;
        }
        if (head.length < HEAD_BYTES) {
          head = Buffer.concat([head, chunk]).subarray(0, HEAD_BYTES);
          if (head.length === HEAD_BYTES && !looksLike(extension, head)) {
            problem = [400, 'invalid_media'];
            break;
          }
        }
        if (!out.write(chunk)) await once(out, 'drain');
      }
    } catch {
      problem = [400, 'incomplete'];
    }
    await new Promise((resolve) => out.end(resolve)).catch(() => undefined);
    if (!problem && (head.length < HEAD_BYTES || (announced && size !== announced))) problem = [400, head.length < HEAD_BYTES ? 'invalid_media' : 'incomplete'];
    if (problem) {
      await rm(temp, { force: true });
      return json({ error: problem[1] }, problem[0]);
    }

    const userDir = join(dir, ticket.u);
    const name = `${ticket.k}-${randomBytes(24).toString('base64url')}.${extension}`;
    await mkdir(userDir, { recursive: true });
    await rename(temp, join(userDir, name));
    await removeKind(userDir, ticket.k, name);
    return json({ url: `${origin}/media/f/${ticket.u}/${name}` });
  }

  async function purge(request) {
    const ticket = await verifyTicket(secret, bearer(request));
    if (!ticket || ticket.a !== 'del' || !USER_ID.test(ticket.u)) return json({ error: 'unauthorized' }, 401);
    const userDir = join(dir, ticket.u);
    if (ticket.k === '*') await rm(userDir, { recursive: true, force: true });
    else if (KINDS.includes(ticket.k)) {
      await removeKind(userDir, ticket.k);
      await rmdir(userDir).catch(() => undefined);   // Só sai se ficou vazia
    } else return json({ error: 'invalid_media' }, 400);
    return json({ ok: true });
  }

  async function serve(request, userId, name, extension) {
    const path = join(dir, userId, name);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return new Response('Not found', { status: 404 });
    const headers = {
      'Content-Type': MIME_BY_EXTENSION[extension],
      'Accept-Ranges': 'bytes',
      // O endereço muda a cada envio: pode ficar em cache para sempre
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin'
    };
    // O vídeo pede o arquivo aos pedaços (Range); sem isso ele não repete nem avança direito
    const range = parseRange(request.headers.get('Range'), info.size);
    if (range === 'invalid') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${info.size}` } });
    const { start, end } = range ?? { start: 0, end: info.size - 1 };
    headers['Content-Length'] = String(end - start + 1);
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    const status = range ? 206 : 200;
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    return new Response(Readable.toWeb(createReadStream(path, { start, end })), { status, headers });
  }

  return {
    // null = o caminho não é da guarda de arquivos (quem chamou segue com as outras rotas)
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/media/')) return null;
      if (path === '/media/upload' && request.method === 'PUT') return upload(request);
      if (path === '/media/purge' && request.method === 'POST') return purge(request);
      const file = path.match(FILE_PATH);
      if (file && (request.method === 'GET' || request.method === 'HEAD')) return serve(request, file[1], file[2], file[3]);
      return json({ error: 'not_found' }, 404);
    },
    // Sobras de envios interrompidos por queda do servidor
    async cleanTemp() {
      const names = await readdir(dir).catch(() => []);
      await Promise.all(names.filter((name) => name.startsWith('.tmp-')).map((name) => rm(join(dir, name), { force: true })));
    }
  };
}
