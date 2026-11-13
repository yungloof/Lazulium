// Chave de comparação de nomes de jogo: o mesmo jogo escrito de jeitos parecidos ("Skate." / "skate") cai na mesma chave.
// É a mesma regra do gameKey do social.
export function titleKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 120);
}
