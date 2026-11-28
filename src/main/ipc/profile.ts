import { shell } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { ProfileCustom, ProfileMediaKind, ProfileWebLink } from '@shared/types/profile';
import { profileService } from '../services/profile/profile.service';
import { profileWebService } from '../services/profile/profile-web.service';
import { resolveShareCardCoverDataUrl } from '../services/profile/share-card-cover';
import { buildYearReview } from '../services/profile/year-review.service';
import { getRecentActivity } from '../services/profile/activity.service';
import { getOnThisDayMemories } from '../services/profile/on-this-day.service';
import { socialService } from '../services/social/social.service';
import { askOpenPaths, handle, safeFileName, saveBufferAs, saveTextAs } from './helpers';

const MAX_YEAR_REVIEW_PNG_BYTES = 15 * 1024 * 1024;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

function parsePngDataUrl(dataUrl: string): Buffer {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error('Formato de imagem inválido.');
  }
  const buffer = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64');
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!isPng || buffer.length > MAX_YEAR_REVIEW_PNG_BYTES) {
    throw new Error('Imagem PNG inválida ou grande demais para salvar.');
  }
  return buffer;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const MEDIA_TITLES: Record<ProfileMediaKind, string> = {
  avatar: 'Escolher avatar',
  background: 'Escolher fundo do perfil',
  artwork: 'Escolher arte em destaque'
};

// Destinos fixos: o renderer só escolhe qual deles abrir
function webLinkTarget(link: ProfileWebLink): string | undefined {
  const { repoUrl, pageUrl } = profileWebService.getStatus();
  switch (link) {
    case 'steam-privacy':
      return 'https://steamcommunity.com/my/edit/settings';
    case 'new-repo':
      return 'https://github.com/new?name=lazulium-perfil&visibility=public';
    case 'pages-settings':
      return repoUrl ? `${repoUrl}/settings/pages` : undefined;
    case 'page':
      return pageUrl;
    default:
      return undefined;
  }
}

export function registerProfileHandlers(): void {
  handle(IPC_CHANNELS.PROFILE_GET, () => profileService.build());
  handle(IPC_CHANNELS.PROFILE_ACTIVITY, (_event, limit?: number) => getRecentActivity(typeof limit === 'number' ? limit : undefined));
  handle(IPC_CHANNELS.PROFILE_ON_THIS_DAY, () => getOnThisDayMemories());
  handle(IPC_CHANNELS.PROFILE_YEAR_REVIEW, (_event, year?: number) => buildYearReview(year));
  handle(IPC_CHANNELS.PROFILE_YEAR_REVIEW_IMAGE, (event, dataUrl: string, year: number) => {
    const buffer = parsePngDataUrl(dataUrl);
    const safeYear = Number.isInteger(year) && year >= 1990 && year <= 2100 ? String(year) : 'ano';
    const fileName = `${safeFileName(`lazulium-retrospectiva-${safeYear}`, 'lazulium-retrospectiva')}.png`;
    return saveBufferAs(
      event,
      { title: 'Salvar imagem da retrospectiva', defaultPath: fileName, filters: [{ name: 'Imagem PNG', extensions: ['png'] }] },
      buffer
    );
  });
  handle(IPC_CHANNELS.PROFILE_SHARE_CARD_IMAGE, (event, dataUrl: string, gameTitle: string) => {
    const buffer = parsePngDataUrl(dataUrl);
    const title = typeof gameTitle === 'string' ? gameTitle.trim().slice(0, 80) : '';
    const fileName = `${safeFileName(title ? `lazulium-${title}` : 'lazulium-cartao', 'lazulium-cartao')}.png`;
    return saveBufferAs(
      event,
      { title: 'Salvar cartão do jogo', defaultPath: fileName, filters: [{ name: 'Imagem PNG', extensions: ['png'] }] },
      buffer
    );
  });
  handle(IPC_CHANNELS.PROFILE_SHARE_CARD_COVER, (_event, gameIds: string | string[]) => {
    const ids = Array.isArray(gameIds) ? gameIds : typeof gameIds === 'string' ? [gameIds] : [];
    return resolveShareCardCoverDataUrl(ids);
  });
  handle(IPC_CHANNELS.PROFILE_SYNC_ACHIEVEMENTS, () => profileService.syncAllAchievements());
  // Os amigos veem o perfil novo em segundos, sem precisar publicar nada (como na Steam)
  handle(IPC_CHANNELS.PROFILE_SAVE_CUSTOM, (_event, custom: ProfileCustom) => {
    const saved = profileService.saveCustom(custom);
    socialService.scheduleSync();
    return saved;
  });

  handle(IPC_CHANNELS.PROFILE_PICK_MEDIA, async (event, kind: ProfileMediaKind) => {
    if (!Object.hasOwn(MEDIA_TITLES, kind)) throw new Error('Tipo de arquivo de perfil inválido.');
    const [path] =
      (await askOpenPaths(event, {
        title: MEDIA_TITLES[kind],
        properties: ['openFile'],
        filters: kind === 'background' ? [{ name: 'Imagens e vídeos', extensions: [...IMAGE_EXTENSIONS, 'webm', 'mp4'] }] : [{ name: 'Imagens', extensions: IMAGE_EXTENSIONS }]
      })) ?? [];
    return path ? profileService.importMedia(kind, path) : null;
  });

  handle(IPC_CHANNELS.PROFILE_WEB_STATUS, () => profileWebService.getStatus());
  handle(IPC_CHANNELS.PROFILE_WEB_PUBLISH, (_event, repoUrl: string) => profileWebService.publish(repoUrl));
  handle(IPC_CHANNELS.PROFILE_WEB_DISCONNECT, () => profileWebService.disconnect());

  handle(IPC_CHANNELS.PROFILE_WEB_OPEN, async (_event, link: ProfileWebLink) => {
    const target = webLinkTarget(link);
    if (!target) throw new Error('Publique o perfil primeiro.');
    await shell.openExternal(target);
  });

  handle(IPC_CHANNELS.PROFILE_EXPORT, (event) =>
    saveTextAs(event, { title: 'Exportar perfil do jogador', defaultPath: 'lazulium-perfil.json', filters: [{ name: 'JSON', extensions: ['json'] }] }, async () =>
      JSON.stringify(profileService.toExportable(await profileService.build()), null, 2)
    )
  );
}
