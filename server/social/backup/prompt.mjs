// Pergunta a senha sem mostrar o que se digita. Sem terminal (ex.: tarefa agendada), usa LAZULIUM_BACKUP_PASS.

export async function askPassphrase(question, { confirm = false } = {}) {
  const fromEnv = process.env.LAZULIUM_BACKUP_PASS;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Sem terminal para perguntar a senha: defina LAZULIUM_BACKUP_PASS.');
  }
  const first = await hidden(question);
  if (confirm && (await hidden('Repita a senha: ')) !== first) throw new Error('As senhas não batem.');
  return first;
}

function hidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let value = '';
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');
    const done = (err) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done();
        if (ch === '\u0003') return done(new Error('Cancelado.'));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}
