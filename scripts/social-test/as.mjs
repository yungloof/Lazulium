// node scripts/social-test/as.mjs <a|b|c> <METHOD> <path> [json]: fala com o servidor local (porta 3199) como A, B ou C.
// No Git Bash, rode com MSYS_NO_PATHCONV=1 para o caminho /v1/... não virar caminho do Windows.
const [who, method, path, body] = process.argv.slice(2);
const token = `token-${who === 'a' || who === 'c' ? who : 'b'}-teste-0000000000000000`;
const res = await fetch(`http://127.0.0.1:3199${path}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body
});
console.log(res.status, await res.text());
