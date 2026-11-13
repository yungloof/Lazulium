// Bilhete assinado (HMAC-SHA-256) entre o servidor da conta e a guarda de arquivos da VPS.
// O servidor da conta sabe quem é a pessoa; a guarda só confere a assinatura e o prazo.
// Formato: base64url(JSON) + "." + base64url(assinatura). WebCrypto: roda igual no Worker e no Node.

const encoder = new TextEncoder();

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const hmacKey = (secret, usage) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

// payload: { a: 'put' | 'del', u: id da conta, k: tipo ('background' ou '*'), e: validade em ms, m: bytes máximos }
export async function signTicket(secret, payload) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

// Devolve o payload, ou null se a assinatura não bate, o prazo passou ou o texto não é um bilhete
export async function verifyTicket(secret, ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length > 1_000) return null;
  const [body, signature, extra] = ticket.split('.');
  if (!body || !signature || extra !== undefined || !/^[\w-]+$/.test(body) || !/^[\w-]+$/.test(signature)) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromBase64Url(signature), encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!payload || typeof payload !== 'object' || typeof payload.e !== 'number' || payload.e < now) return null;
    return payload;
  } catch {
    return null;
  }
}
