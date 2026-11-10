import { shell } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { ProfileCustom, ProfileMediaKind, ProfileWebLink } from '@shared/types/profile';
import { profileService } from '../services/profile/profile.service';
import { profileWebService } from '../services/profile/profile-web.service';
import { buildYearReview } from '../services/profile/year-review.service';
import { askOpenPaths, handle, saveTextAs } from './helpers';

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
  handle(IPC_CHANNELS.PROFILE_YEAR_REVIEW, (_event, year?: number) => buildYearReview(year));
  handle(IPC_CHANNELS.PROFILE_SYNC_ACHIEVEMENTS, () => profileService.syncAllAchievements());
  handle(IPC_CHANNELS.PROFILE_SAVE_CUSTOM, (_event, custom: ProfileCustom) => profileService.saveCustom(custom));

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
