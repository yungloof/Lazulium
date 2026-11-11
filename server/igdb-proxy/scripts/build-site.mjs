// Gera src/site.js com as páginas públicas do Lazulium (início e política de privacidade).
// O Google exige as duas para tirar o login do Drive do modo de teste.
// A política vem de docs/privacidade.md: rode `npm run site` depois de mudar o texto.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const target = href === 'privacidade.md' ? '/privacidade' : href;
      const external = /^https?:/.test(target);
      return `<a href="${target}"${external ? ' rel="noopener"' : ''}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

// Markdown simples: títulos, parágrafos, listas, tabelas, negrito, itálico, código e links
function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ''));
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</ul>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (row) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(
        `<div class="table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*-\s|\|)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

// Logo do app (a mesma da interface), embutida para a página não depender de outro arquivo
const LOGO = 'data:image/png;base64,' + readFileSync(join(root, 'src', 'renderer', 'src', 'assets', 'logo.png')).toString('base64');

const STYLE = `
:root{--bg:#0e1426;--panel:#151c30;--line:#1f2840;--text:#e2e9f7;--soft:#a7b5d3;--muted:#8292b5;--accent:#4a80ff;--accent2:#93b6ff}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 500px at 20% -10%,#1d3478 0%,transparent 60%),var(--bg);color:var(--text);font:16px/1.65 "Segoe UI",Inter,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:48px 20px 80px}
header.top{display:flex;align-items:center;gap:12px;margin-bottom:40px}
header.top a{color:var(--text);text-decoration:none;font-weight:700;font-size:20px;letter-spacing:-.01em}
.logo{width:36px;height:36px;display:block}
nav{margin-left:auto;display:flex;gap:18px;font-size:14px}
nav a{color:var(--soft);text-decoration:none}nav a:hover{color:#fff}
h1{font-size:clamp(30px,5vw,44px);line-height:1.15;letter-spacing:-.02em;margin:0 0 16px}
h2{font-size:22px;margin:40px 0 10px;letter-spacing:-.01em}
h3{font-size:17px;margin:28px 0 8px;color:var(--accent2)}
p,li{color:var(--soft)}strong{color:var(--text)}
a{color:var(--accent2)}a:hover{color:#fff}
code{background:#0a0f1d;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:.88em;color:var(--text)}
ul{padding-left:22px}
.lead{font-size:19px;color:var(--soft);max-width:680px}
.accent{color:var(--accent2)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:36px 0}
@media (max-width:560px){.grid{grid-template-columns:1fr}nav{gap:12px}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px}
.card h3{margin:0 0 6px;color:var(--text)}.card p{margin:0;font-size:14px}
.table{overflow-x:auto;margin:16px 0;border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}
th{background:var(--panel);color:var(--text)}td{color:var(--soft)}tr:last-child td{border-bottom:0}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
`;

function page(title, description, body) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" href="${LOGO}">
<style>${STYLE.trim()}</style>
</head>
<body>
<main>
<header class="top"><img class="logo" src="${LOGO}" alt="" width="36" height="36"><a href="/">Lazulium</a><nav><a href="/">Início</a><a href="/privacidade">Privacidade</a></nav></header>
${body}
<footer>Lazulium · aplicativo gratuito para Windows 10 e 11 · contato: <a href="mailto:yungloof06@gmail.com">yungloof06@gmail.com</a> · <a href="/privacidade">Política de privacidade</a></footer>
</main>
</body>
</html>`;
}

const home = page(
  'Lazulium: todos os seus jogos de PC num lugar só',
  'Biblioteca de jogos para Windows que junta Steam, Epic, GOG, Riot, Xbox, emuladores e jogos avulsos, com horas jogadas, conquistas, capturas e backup dos saves.',
  `<h1>Todos os seus jogos, <span class="accent">num lugar só.</span></h1>
<p class="lead">O Lazulium é um aplicativo gratuito para Windows que encontra os jogos instalados no seu PC (Steam, Epic, GOG, Riot, Xbox, emuladores e jogos avulsos), baixa capas para todos, conta as horas de qualquer jogo e guarda o seu histórico, mesmo dos jogos que você desinstalou.</p>
<div class="grid">
<div class="card"><h3>Uma biblioteca só</h3><p>Lojas, emuladores e jogos soltos, achados sozinhos, com capas e artes para todos.</p></div>
<div class="card"><h3>Horas e conquistas</h3><p>Tempo de jogo de tudo, conquistas da Steam e do RetroAchievements com o mesmo destaque.</p></div>
<div class="card"><h3>Diário e perfil</h3><p>Notas, resenhas, listas e um perfil para mostrar aos amigos.</p></div>
<div class="card"><h3>Saves protegidos</h3><p>Backup dos saves no seu PC e, se você quiser, no seu Google Drive.</p></div>
</div>
<h2>Privacidade</h2>
<p>Não existe conta do Lazulium, nem anúncios, nem telemetria. Seus dados ficam no seu computador. O Google Drive só é usado se você conectar, e o app só enxerga os arquivos que ele mesmo criou, para guardar os backups dos saves. Leia a <a href="/privacidade">política de privacidade completa</a>.</p>
<h2>Como conseguir</h2>
<p>O Lazulium está em fase de lançamento e é distribuído pelo próprio desenvolvedor. Se alguém te indicou, peça o instalador para essa pessoa. Dúvidas: <a href="mailto:yungloof06@gmail.com">yungloof06@gmail.com</a>.</p>`
);

const privacyMd = readFileSync(join(root, 'docs', 'privacidade.md'), 'utf8');
const privacy = page('Política de privacidade do Lazulium', 'Como o Lazulium trata os seus dados: o que fica no seu PC, o que é enviado e para quem, e o uso do Google Drive.', markdownToHtml(privacyMd));

const output = `// Gerado por scripts/build-site.mjs a partir de docs/privacidade.md. Não edite à mão: rode \`npm run site\`.
export const SITE_PAGES = {
  '/': ${JSON.stringify(home)},
  '/privacidade': ${JSON.stringify(privacy)}
};
`;
writeFileSync(join(here, '..', 'src', 'site.js'), output);
console.log(`site.js gerado: início ${home.length} bytes, privacidade ${privacy.length} bytes`);
