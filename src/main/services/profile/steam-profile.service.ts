import { app } from 'electron';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { rename, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { SteamProfileIdentity } from '@shared/types/profile';
import { db } from '../../database/db';
import { mediaUrl } from '../metadata/media-cache.service';

const CDN = 'https://shared.fastly.steamstatic.com/community_assets/images/';
const ALLOWED_ASSET_HOST = /(^|\.)(steamstatic\.com|steamusercontent\.com)$/i;
const FETCH_TIMEOUT_MS = 8_000;
const CACHED_WAIT_MS = 3_000;           // Com dados guardados, não segura a tela esperando a rede
const REFRESH_AFTER_MS = 10 * 60_000;
const ASSET_TIMEOUT_MS = 120_000;
const MAX_ASSET_BYTES = 60 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/apng': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/webm': 'webm',
  'video/mp4': 'mp4'
};

const decodeEntities = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');

// O resumo da Steam vem em HTML: aqui sobra só o texto
const toPlainText = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .trim();

function cdata(xml: string, tag: string): string | undefined {
  const value = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))?.[1];
  return value ? toPlainText(value) || undefined : undefined;
}

const toNumber = (text?: string) => {
  const value = Number((text ?? '').replace(/,/g, ''));
  return Number.isFinite(value) ? value : undefined;
};

function isAllowedAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_ASSET_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

const assetOrUndefined = (url?: string) => (url && isAllowedAsset(url) ? url : undefined);

// ?xml=1: identidade pública e horas das últimas 2 semanas por jogo
export function parseSteamProfileXml(xml: string): Partial<SteamProfileIdentity> {
  const state = xml.match(/<onlineState>(.*?)<\/onlineState>/)?.[1];
  const recentByAppId: Record<string, number> = {};
  for (const [, block] of xml.matchAll(/<mostPlayedGame>([\s\S]*?)<\/mostPlayedGame>/g)) {
    const appId = block.match(/steamcommunity\.com\/app\/(\d+)/)?.[1];
    const hours = toNumber(block.match(/<hoursPlayed>([\d.,]+)<\/hoursPlayed>/)?.[1]);
    if (appId && hours !== undefined) recentByAppId[appId] = hours;
  }
  return {
    realName: cdata(xml, 'realname'),
    location: cdata(xml, 'location'),
    summary: cdata(xml, 'summary'),
    memberSince: xml.match(/<memberSince>(.*?)<\/memberSince>/)?.[1],
    state: state === 'in-game' || state === 'online' || state === 'offline' ? state : undefined,
    recentByAppId
  };
}

// A página pública é a única fonte de vitrines e insígnias; se a Steam mudar o HTML, o item só não aparece
export function parseSteamProfileHtml(html: string): Partial<SteamProfileIdentity> {
  const counts: Record<string, number> = {};
  for (const [, label, total] of html.matchAll(/count_link_label">([^<]+)<\/span>[^<]*<span class="profile_count_link_total">\s*([\d.,]*)\s*</g)) {
    const value = toNumber(total);
    if (total && value !== undefined) counts[label.trim().toLowerCase()] = value;
  }

  const badges = [...html.matchAll(/profile_badges_badge[^"]*"\s+data-tooltip-html="([^"]*)"[\s\S]*?<img src="([^"]+)"/g)].flatMap(([, tooltip, icon]) => {
    const iconUrl = assetOrUndefined(icon);
    return iconUrl ? [{ name: toPlainText(tooltip.split(/<br|&lt;br/i)[0]), iconUrl }] : [];
  });

  const favorite = html.match(/favorite_badge_icon"\s+data-tooltip-html="([^"]*)"[\s\S]*?<img src="([^"]+)"[\s\S]*?favorite_badge_description">\s*<div class="name[^"]*">([^<]*)<\/div>\s*<div class="xp">([^<]*)</);
  const favoriteIcon = assetOrUndefined(favorite?.[2]);

  const art = html.match(/profile_customization_header">Artwork Showcase<[\s\S]*?screenshot_showcase_screenshot[^>]*href="([^"]+)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?screenshot_showcase_itemname">\s*([^<]*?)\s*</);
  // Sem os parâmetros de tamanho, a Steam entrega a arte original
  const artImage = art ? assetOrUndefined(decodeEntities(art[2]).split('?')[0]) : undefined;

  const flag = html.match(/class="profile_flag"\s+src="([^"]+\/countryflags\/([a-z]{2})\.gif)"/i);

  return {
    counts,
    badges,
    favoriteBadge: favorite && favoriteIcon ? { name: toPlainText(favorite[3]), detail: toPlainText(favorite[4]), iconUrl: favoriteIcon } : undefined,
    showcaseArt: artImage ? { title: toPlainText(art![3]), imageUrl: artImage } : undefined,
    flagUrl: assetOrUndefined(flag?.[1]),
    recentHours: toNumber(html.match(/([\d.,]+) hours past 2 weeks/)?.[1])
  };
}

interface EquippedItems {
  profile_background?: { image_large?: string; movie_webm?: string };
  avatar_frame?: { image_small?: string; image_large?: string };
}

export function parseEquippedItems(items: EquippedItems | undefined): Partial<SteamProfileIdentity> {
  const asset = (path?: string) => (path ? `${CDN}${path}` : undefined);
  const background = items?.profile_background;
  return {
    background: background?.image_large || background?.movie_webm ? { imageUrl: asset(background.image_large), videoUrl: asset(background.movie_webm) } : undefined,
    avatarFrameUrl: asset(items?.avatar_frame?.image_small ?? items?.avatar_frame?.image_large)
  };
}

function assetsDir(): string {
  return join(app.getPath('userData'), 'profile', 'steam');
}

function assetKey(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function collectAssets(identity: SteamProfileIdentity): string[] {
  return [
    identity.background?.imageUrl,
    identity.background?.videoUrl,
    identity.avatarFrameUrl,
    identity.showcaseArt?.imageUrl,
    identity.favoriteBadge?.iconUrl,
    identity.flagUrl,
    ...(identity.badges ?? []).map((b) => b.iconUrl)
  ].filter((url): url is string => !!url);
}

class SteamProfileService {
  private refreshing?: Promise<SteamProfileIdentity>;
  private downloading = false;

  // Identidade pública do perfil Steam, sem chave de API. Funciona offline com o que já foi guardado.
  async get(steamId: string): Promise<SteamProfileIdentity | undefined> {
    const cached = db.getSteamProfileCache();
    const usable = cached?.steamId === steamId ? cached : undefined;
    if (usable && Date.now() - usable.fetchedAt < REFRESH_AFTER_MS) return this.withLocalAssets(usable);

    this.refreshing ??= this.refresh(steamId, usable).finally(() => {
      this.refreshing = undefined;
    });
    try {
      const pending = this.refreshing;
      const fresh = usable ? await Promise.race([pending, new Promise<undefined>((r) => setTimeout(() => r(undefined), CACHED_WAIT_MS))]) : await pending;
      return this.withLocalAssets(fresh ?? usable!);
    } catch (err) {
      console.warn('[Profile] Perfil público da Steam indisponível:', (err as Error).message);
      return usable ? this.withLocalAssets(usable) : undefined;
    }
  }

  private async refresh(steamId: string, previous?: SteamProfileIdentity): Promise<SteamProfileIdentity> {
    const text = async (url: string) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    };
    const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
    const [xml, html, equipped] = await Promise.allSettled([
      text(`${profileUrl}/?xml=1`),
      text(`${profileUrl}/?l=english`),
      text(`https://api.steampowered.com/IPlayerService/GetProfileItemsEquipped/v1/?steamid=${steamId}`)
    ]);
    if (xml.status === 'rejected' && html.status === 'rejected' && equipped.status === 'rejected') throw xml.reason;

    // Uma fonte fora do ar mantém o que já se sabia dela
    const identity: SteamProfileIdentity = { ...previous, steamId, fetchedAt: Date.now(), state: undefined };
    if (xml.status === 'fulfilled') Object.assign(identity, parseSteamProfileXml(xml.value));
    if (html.status === 'fulfilled') Object.assign(identity, parseSteamProfileHtml(html.value));
    if (equipped.status === 'fulfilled') {
      try {
        Object.assign(identity, parseEquippedItems(JSON.parse(equipped.value)?.response));
      } catch {
        // Resposta inválida: segue com o que já se sabia
      }
    }
    db.setSteamProfileCache(identity);
    void this.downloadAssets(identity);
    return identity;
  }

  // Troca as URLs remotas pelas cópias locais que já terminaram de baixar
  private withLocalAssets(identity: SteamProfileIdentity): SteamProfileIdentity {
    const dir = assetsDir();
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.endsWith('.tmp')) : [];
    const local = (url?: string) => {
      if (!url) return undefined;
      const file = files.find((f) => f.startsWith(`${assetKey(url)}.`));
      return file ? mediaUrl('profile', `steam/${file}`) : url;
    };
    if (collectAssets(identity).some((url) => !files.some((f) => f.startsWith(`${assetKey(url)}.`)))) void this.downloadAssets(identity);
    return {
      ...identity,
      background: identity.background && { imageUrl: local(identity.background.imageUrl), videoUrl: local(identity.background.videoUrl) },
      avatarFrameUrl: local(identity.avatarFrameUrl),
      showcaseArt: identity.showcaseArt && { ...identity.showcaseArt, imageUrl: local(identity.showcaseArt.imageUrl)! },
      favoriteBadge: identity.favoriteBadge && { ...identity.favoriteBadge, iconUrl: local(identity.favoriteBadge.iconUrl)! },
      flagUrl: local(identity.flagUrl),
      badges: identity.badges?.map((b) => ({ ...b, iconUrl: local(b.iconUrl)! }))
    };
  }

  private async downloadAssets(identity: SteamProfileIdentity): Promise<void> {
    if (this.downloading) return;
    this.downloading = true;
    try {
      const dir = assetsDir();
      mkdirSync(dir, { recursive: true });
      const urls = collectAssets(identity);
      for (const url of urls) {
        const key = assetKey(url);
        if (readdirSync(dir).some((f) => f.startsWith(`${key}.`) && !f.endsWith('.tmp'))) continue;
        try {
          await this.downloadAsset(url, key, dir);
        } catch (err) {
          console.warn('[Profile] Falha ao guardar item do perfil Steam:', (err as Error).message);
        }
      }
      // Fundo ou moldura trocados na Steam: o arquivo antigo não serve mais
      const keys = new Set(urls.map(assetKey));
      for (const file of readdirSync(dir)) {
        if (!keys.has(file.split('.')[0])) await unlink(join(dir, file)).catch(() => undefined);
      }
    } finally {
      this.downloading = false;
    }
  }

  private async downloadAsset(url: string, key: string, dir: string): Promise<void> {
    if (!isAllowedAsset(url)) throw new Error('origem não permitida');
    const res = await fetch(url, { signal: AbortSignal.timeout(ASSET_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_ASSET_BYTES) throw new Error('arquivo grande demais');
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = EXTENSION_BY_MIME[mime] ?? new URL(url).pathname.match(/\.(png|jpe?g|webp|gif|webm|mp4)$/i)?.[1].toLowerCase();
    if (!ext) throw new Error(`formato não suportado (${mime || 'desconhecido'})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_ASSET_BYTES) throw new Error('arquivo grande demais');
    const tmp = join(dir, `${key}.${ext}.tmp`);
    await writeFile(tmp, buffer);
    await rename(tmp, join(dir, `${key}.${ext}`));
  }
}

export const steamProfileService = new SteamProfileService();
