// Confere, antes do electron-builder, se o pacote vai ter tudo o que o app usa em produção.
// Roda sozinho em `npm run build:win` e `npm run build:portable`, depois do `npm run build`.
// Uso: node scripts/check-package.mjs [pasta do build]   (padrão: out)
//
// 1. O main e o preload carregam do node_modules empacotado só o que está em `dependencies` e não foi
//    tirado do pacote em `build.files` (as libs do renderer já vão dentro do bundle do Vite e ficam de fora).
// 2. Os arquivos de `extraResources` (ícones, página do perfil) e as imagens do instalador existem.
import { builtinModules } from 'module';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = resolve(root, process.argv[2] ?? 'out');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const build = pkg.build ?? {};
const problems = [];
const rel = (path) => relative(root, path).replace(/\\/g, '/');

// --- 1. Módulos externos do main e do preload ---
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const dependencies = new Set(Object.keys(pkg.dependencies ?? {}));

// Padrões como "!**/node_modules/{react,react-dom}/**" ou "!node_modules/lucide-react/**"
const excluded = new Set();
for (const pattern of build.files ?? []) {
  const match = typeof pattern === 'string' && pattern.match(/^!(?:\*\*\/)?node_modules\/(\{[^}]+\}|[^/{}]+)\//);
  if (!match) continue;
  for (const name of match[1].replace(/^\{|\}$/g, '').split(',')) excluded.add(name.trim());
}

const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

function* scripts(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* scripts(path);
    else if (/\.(c|m)?js$/.test(entry.name)) yield path;
  }
}

const used = new Set();
for (const part of ['main', 'preload']) {
  const dir = join(outDir, part);
  if (!existsSync(dir)) {
    problems.push(`Falta ${rel(dir)}: rode "npm run build" antes.`);
    continue;
  }
  for (const file of scripts(dir)) {
    const code = readFileSync(file, 'utf-8');
    // O electron-vite gera CommonJS: módulos externos aparecem como require("x") (ou import("x") dinâmico)
    for (const match of code.matchAll(/\b(?:require|import)\(\s*["']([^"'./][^"']*)["']\s*\)/g)) {
      const spec = match[1];
      if (builtins.has(spec) || spec === 'electron' || spec.startsWith('electron/')) continue;
      const name = packageName(spec);
      used.add(name);
      if (!dependencies.has(name)) {
        problems.push(`${rel(file)} usa "${spec}", que não está em "dependencies": o app instalado não vai encontrar.`);
      } else if (excluded.has(name)) {
        problems.push(`${rel(file)} usa "${spec}", que "build.files" tira do pacote: remova "${name}" das exclusões.`);
      }
    }
  }
}

if (!existsSync(join(outDir, 'renderer', 'index.html'))) problems.push(`Falta ${rel(join(outDir, 'renderer', 'index.html'))}.`);

// --- 2. Arquivos que o electron-builder copia ou usa ---
for (const entry of build.extraResources ?? []) {
  const from = join(root, entry.from);
  const files = (entry.filter ?? []).filter((name) => !name.startsWith('!') && !/[*?{]/.test(name));
  if (!existsSync(from)) problems.push(`extraResources: a pasta ${entry.from} não existe.`);
  for (const name of files) {
    if (!existsSync(join(from, name))) problems.push(`extraResources: falta ${entry.from}/${name} (o app lê esse arquivo instalado).`);
  }
}

const buildResources = build.directories?.buildResources ?? 'build';
const assets = [build.win?.icon, build.nsis?.installerIcon, build.nsis?.uninstallerIcon, build.nsis?.installerSidebar, build.nsis?.uninstallerSidebar, build.nsis?.installerHeader];
for (const asset of assets.filter(Boolean)) {
  if (!existsSync(join(root, asset)) && !existsSync(join(root, buildResources, asset))) {
    problems.push(`Falta ${asset} (configurado no build). Gere com "npm run icons".`);
  }
}

if (problems.length) {
  console.error(`\nO pacote não está pronto (${problems.length} problema${problems.length > 1 ? 's' : ''}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

const external = [...used].sort();
console.log(`Pacote conferido: main e preload usam ${external.length ? external.join(', ') : 'só módulos do Node e do Electron'}; recursos e imagens do instalador presentes.`);
