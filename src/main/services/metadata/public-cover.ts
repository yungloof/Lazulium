import { Game } from '@shared/types/game';

// Imagens que abrem fora deste PC: a vitrine no servidor social e a página web do perfil só aceitam estes
// endereços (img-src de PAGE_IMG_SRC em server/social e o <meta> de web/profile/index.html). Capa de outro lugar,
// como a CDN da Epic, é barrada lá e vira um quadro vazio; a guardada no PC (lazulium-media://) nem existe lá.
export const PUBLIC_IMAGE =
  /^https:\/\/(cdn\.cloudflare\.steamstatic\.com|shared\.[a-z.]*steamstatic\.com|steamcdn-a\.akamaihd\.net|images\.igdb\.com|cdn2\.steamgriddb\.com)\//i;

export const STEAM_COVER = (appId: string): string => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;

export const isPublicImage = (url: string | null | undefined): url is string => !!url && PUBLIC_IMAGE.test(url);

export const steamAppIdOf = (game: Pick<Game, 'platform' | 'platformGameId'>): string | undefined =>
  game.platform === 'steam' && game.platformGameId && /^\d{1,10}$/.test(game.platformGameId) ? game.platformGameId : undefined;

// A capa que amigos e a página do perfil veem, a mesma regra em toda parte (destaques, listas, Diário, feed):
// 1. a arte que você escolheu (o endereço de onde ela foi baixada), para verem a mesma capa que você;
// 2. Steam: a capa conferida, ou o endereço padrão até conferir (lançamentos novos não têm esse endereço);
// 3. os outros: a capa, se já for um endereço aceito, ou a padrão do IGDB que o serviço social encontrou.
export function publicCoverOf(game: Game): string | null {
  const { coverSourceUrl, coverUrl, publicCoverUrl } = game.media ?? {};
  if (isPublicImage(coverSourceUrl)) return coverSourceUrl;
  const appId = steamAppIdOf(game);
  if (appId) return isPublicImage(publicCoverUrl) ? publicCoverUrl : STEAM_COVER(appId);
  if (isPublicImage(coverUrl)) return coverUrl;
  if (isPublicImage(publicCoverUrl)) return publicCoverUrl;
  return null;
}

// Falta procurar a capa pública: Steam ainda não conferida, ou outro jogo sem nenhum endereço aceito
export function needsPublicCoverLookup(game: Game): boolean {
  if (isPublicImage(game.media?.coverSourceUrl)) return false;
  return steamAppIdOf(game) ? !isPublicImage(game.media?.publicCoverUrl) : !publicCoverOf(game);
}

// Fundo (hero) só de endereço aceito; sem ele a página usa a capa
export const publicHeroOf = (url: string | undefined): string | undefined => (isPublicImage(url) ? url : undefined);
