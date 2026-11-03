// Confere o servidor publicado com jogos reais: node smoke.mjs https://lazulium-igdb.SEU-USUARIO.workers.dev
const base = process.argv[2]?.replace(/\/+$/, '');
if (!base) {
  console.error('Informe a URL: node smoke.mjs https://lazulium-igdb.SEU-USUARIO.workers.dev');
  process.exit(2);
}

const hours = (seconds) => (seconds ? `${(seconds / 3600).toFixed(1)} h` : '-');
const failures = [];

async function call(query) {
  const res = await fetch(`${base}/v1/time-to-beat?${query}`, { signal: AbortSignal.timeout(20000) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const expectFound = [
  ['Steam: Portal 2', 'steamAppId=620'],
  ['Steam: Cyberpunk 2077', 'steamAppId=1091500'],
  ['Título: Ocarina of Time', `title=${encodeURIComponent('The Legend of Zelda: OCARINA OF TIME')}`],
  ['Título: Breath of the Wild', `title=${encodeURIComponent('The Legend of Zelda: BREATH OF THE WILD')}`]
];

for (const [label, query] of expectFound) {
  const { status, body } = await call(query);
  const found = status === 200 && body?.found;
  if (!found) failures.push(label);
  console.log(`${found ? 'ok  ' : 'FALHOU'} ${label}: ${found ? `${body.name} | campanha ${hours(body.hastily)} | extras ${hours(body.normally)} | 100% ${hours(body.completely)} | ${body.count} envios` : `status ${status} ${JSON.stringify(body)}`}`);
}

const checks = [
  ['Jogo inexistente', 'title=zzzz%20jogo%20que%20nao%20existe%20qqqq', (r) => r.status === 200 && r.body?.found === false],
  ['Entrada inválida', 'steamAppId=abc', (r) => r.status === 400]
];
for (const [label, query, check] of checks) {
  const result = await call(query);
  const passed = check(result);
  if (!passed) failures.push(label);
  console.log(`${passed ? 'ok  ' : 'FALHOU'} ${label}: status ${result.status}`);
}

console.log(failures.length ? `\n${failures.length} falha(s).` : '\nTudo certo.');
process.exit(failures.length ? 1 : 0);
