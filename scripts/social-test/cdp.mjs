// node scripts/social-test/cdp.mjs <porta> <script.js> [captura.png]: inspeciona o app aberto em modo silencioso.
// CDP_URL escolhe a página pelo começo do endereço (padrão: 'file', a janela do app).
// Roda o arquivo como uma expressão async na página e imprime o resultado; opcionalmente salva uma captura depois.
import { readFileSync, writeFileSync } from 'node:fs';

const [port, scriptPath, shotPath] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith(process.env.CDP_URL ?? 'file'));
if (!page) throw new Error('Nenhuma página: ' + JSON.stringify(targets));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

if (process.env.CDP_BLOCK) {
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: process.env.CDP_BLOCK.split(',') });
}
if (scriptPath && scriptPath !== '-') {
  const body = readFileSync(scriptPath, 'utf8');
  const result = await send('Runtime.evaluate', { expression: `(async () => {\n${body}\n})()`, awaitPromise: true, returnByValue: true });
  if (result.result?.exceptionDetails) console.log('EXCEPTION', JSON.stringify(result.result.exceptionDetails, null, 1).slice(0, 3000));
  else console.log(typeof result.result?.result?.value === 'string' ? result.result.result.value : JSON.stringify(result.result?.result?.value, null, 1));
}
if (shotPath) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
  console.log('captura:', shotPath);
}
ws.close();
