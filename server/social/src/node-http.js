// Ponte entre o servidor HTTP do Node e o Request/Response da web, usada pelo server.mjs e pelo media-server.mjs.
// O corpo vai e volta em fluxo: um vídeo de 50 MB não fica inteiro na memória.
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function toRequest(req, publicOrigin) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
  headers.set('CF-Connecting-IP', ip);
  const hasBody = !['GET', 'HEAD'].includes(req.method ?? 'GET');
  return new Request(new URL(req.url ?? '/', publicOrigin), { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: hasBody ? 'half' : undefined });
}

export async function sendResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return void res.end();
  // Quem pediu pode fechar no meio (o vídeo troca de faixa o tempo todo): não é erro
  await pipeline(Readable.fromWeb(response.body), res).catch(() => undefined);
}
