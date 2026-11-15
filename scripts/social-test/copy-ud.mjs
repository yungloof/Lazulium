// Cópia só de leitura dos dados do app para uma pasta de teste, com as chaves zeradas e a conta Lazulium de teste (A).
// node scripts/social-test/copy-ud.mjs <pasta de teste fora do projeto>. Nunca escreve em %APPDATA%\Lazulium.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [target] = process.argv.slice(2);
const source = join(process.env.APPDATA, 'Lazulium');
mkdirSync(join(target, 'storage'), { recursive: true });
copyFileSync(join(source, 'Local State'), join(target, 'Local State'));
const achievements = join(source, 'storage', 'lazulium_achievements.json');
if (existsSync(achievements)) copyFileSync(achievements, join(target, 'storage', 'lazulium_achievements.json'));

const data = JSON.parse(readFileSync(join(source, 'storage', 'lazulium_db.json'), 'utf8'));
const settings = data.settings ?? {};
for (const key of ['steamGridDbApiKey', 'steamWebApiKey', 'retroAchievementsApiKey', 'googleClientSecret', 'googleDriveRefreshToken', 'socialToken', 'epicRefreshToken']) settings[key] = '';
settings.socialToken = 'token-a-teste-0000000000000000';
settings.socialProfile = JSON.stringify({
  user: { id: '11111111-1111-4111-8111-111111111111', name: 'Lazuli (teste)', avatarUrl: null },
  settings: { shareProfile: true, shareActivity: true, sharePlaytime: true, shareAchievements: true, shareReviews: true, shareNowPlaying: true }
});
for (const key of ['socialLastPushAt', 'socialLastSyncAt', 'socialShowcaseHash', 'socialMedia', 'socialLibrarySent']) settings[key] = '';
settings.callOpenDiscord = 'false';
settings.callVolume = '25';
// Sem a janela de novidades por cima do que se quer testar
settings.lastSeenVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
data.settings = settings;
writeFileSync(join(target, 'storage', 'lazulium_db.json'), JSON.stringify(data));

// Jogos com horas e conquistas, para o amigo falso ter algo em comum
const games = (data.games ?? []).filter((g) => !g.isHidden && (g.totalPlaytimeSeconds ?? 0) > 0).sort((a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0));
let lists = {};
try {
  const raw = JSON.parse(readFileSync(achievements, 'utf8'));
  lists = raw.achievements ?? raw;
} catch {}
console.log(
  JSON.stringify(
    games.slice(0, 8).map((g) => {
      const a = lists[g.id];
      return { id: g.id, title: g.title, platform: g.platform, appId: g.platformGameId, hours: Math.round((g.totalPlaytimeSeconds ?? 0) / 3600), ach: a ? `${a.source} ${a.unlocked}/${a.total}` : null };
    }),
    null,
    1
  )
);
