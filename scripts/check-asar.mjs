// Confere o pacote PRONTO (app.asar) antes de virar instalador: cada biblioteca que o main usa em
// produção, e as de que ela depende (pelo package-lock), tem que estar lá dentro.
// Na 3.1.1 o instalador saiu sem o fs-extra (e outras 13), porque o node_modules era um atalho de
// pasta, e o app não abria. O check-package.mjs não pega isso: ele roda antes do electron-builder.
//
// Roda sozinho no electron-builder (afterPack, em package.json) e barra o instalador se faltar algo.
// À mão: node scripts/check-asar.mjs [caminho do app.asar]   (padrão: dist/win-unpacked/resources/app.asar)
import { existsSync, openSync, readFileSync, readSync, closeSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Cabeçalho do asar: [4][tamanho do cabeçalho][4][tamanho do JSON][JSON com a árvore de arquivos]
function readAsarTree(asarPath) {
  const fd = openSync(asarPath, 'r');
  try {
    const sizes = Buffer.alloc(16);
    readSync(fd, sizes, 0, 16, 0);
    const jsonLength = sizes.readUInt32LE(12);
    const json = Buffer.alloc(jsonLength);
    readSync(fd, json, 0, jsonLength, 16);
    return JSON.parse(json.toString('utf-8'));
  } finally {
    closeSync(fd);
  }
}

function hasFile(tree, path) {
  let node = tree;
  for (const part of path.split('/')) {
    node = node?.files?.[part];
    if (!node) return false;
  }
  return true;
}

// Mesmas exclusões que o check-package.mjs lê de build.files (libs do renderer, que vão no bundle do Vite)
function excludedPackages(pkg) {
  const excluded = new Set();
  for (const pattern of pkg.build?.files ?? []) {
    const match = typeof pattern === 'string' && pattern.match(/^!(?:\*\*\/)?node_modules\/(\{[^}]+\}|[^/{}]+)\//);
    if (!match) continue;
    for (const name of match[1].replace(/^\{|\}$/g, '').split(',')) excluded.add(name.trim());
  }
  return excluded;
}

// Pastas de node_modules (como no package-lock) que o app instalado precisa
export function requiredPackages(pkg, lock) {
  const packages = lock.packages ?? {};
  const excluded = excludedPackages(pkg);
  const needed = new Set();
  const missingFromLock = [];

  // Resolução do Node: node_modules mais perto de quem pede, subindo até a raiz
  const locate = (from, name) => {
    let base = from;
    for (;;) {
      const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;
      if (packages[candidate]) return candidate;
      if (!base) return null;
      const cut = base.lastIndexOf('/node_modules/');
      base = cut === -1 ? '' : base.slice(0, cut);
    }
  };

  const visit = (from, name, optional) => {
    const path = locate(from, name);
    if (!path) {
      if (!optional) missingFromLock.push(`${name} (pedido por ${from || 'package.json'})`);
      return;
    }
    if (needed.has(path)) return;
    needed.add(path);
    const entry = packages[path];
    for (const dep of Object.keys(entry.dependencies ?? {})) visit(path, dep, false);
    for (const dep of Object.keys(entry.optionalDependencies ?? {})) visit(path, dep, true);
  };

  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!excluded.has(name)) visit('', name, false);
  }
  return { needed: [...needed].sort(), missingFromLock };
}

export function checkAsar(asarPath) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf-8'));
  const tree = readAsarTree(asarPath);
  const { needed, missingFromLock } = requiredPackages(pkg, lock);
  const problems = missingFromLock.map((name) => `Falta no package-lock: ${name}. Rode "npm install".`);
  for (const path of needed) {
    // O electron-builder junta cópias aninhadas no node_modules principal: vale lá também
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (!hasFile(tree, `${path}/package.json`) && !hasFile(tree, `node_modules/${name}/package.json`)) {
      problems.push(`Falta ${name} dentro do pacote.`);
    }
  }
  for (const file of ['package.json', 'out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']) {
    if (!hasFile(tree, file)) problems.push(`Falta ${file} dentro do pacote.`);
  }
  return { needed, problems };
}

function report(asarPath) {
  const { needed, problems } = checkAsar(asarPath);
  if (problems.length) {
    const message = [
      `O pacote ${asarPath} está incompleto (${problems.length} problema${problems.length > 1 ? 's' : ''}); o app instalado não abriria:`,
      ...problems.map((problem) => `  - ${problem}`),
      'Gere de novo numa pasta com "npm ci" (node_modules de verdade, não um atalho de pasta).'
    ].join('\n');
    throw new Error(message);
  }
  console.log(`  • pacote conferido: ${needed.length} bibliotecas do main dentro do app.asar`);
}

// Gancho afterPack do electron-builder: roda antes de montar o instalador e o portátil
export default async function afterPack(context) {
  report(join(context.appOutDir, 'resources', 'app.asar'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const asarPath = resolve(process.argv[2] ?? join(root, 'dist', 'win-unpacked', 'resources', 'app.asar'));
  if (!existsSync(asarPath)) {
    console.error(`Não achei ${asarPath}.`);
    process.exit(1);
  }
  try {
    report(asarPath);
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
}
