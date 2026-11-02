import { app } from 'electron';
import { execFile } from 'child_process';
import { copyFile, mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { ProfileWebStatus } from '@shared/types/profile';
import { db } from '../../database/db';
import { profileService } from './profile.service';

const execFileAsync = promisify(execFile);

const GITHUB_REPO = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;
const GIT_TIMEOUT_MS = 3 * 60_000;
const BRANCH = 'main';
// Commits públicos: o e-mail do jogador nunca entra no histórico do site
const COMMIT_IDENTITY = ['-c', 'user.name=Lazulium', '-c', 'user.email=lazulium@users.noreply.github.com', '-c', 'core.autocrlf=false'];

function parseRepo(url: string): { owner: string; repo: string; cleanUrl: string } {
  const match = url.trim().match(GITHUB_REPO);
  if (!match) throw new Error('Cole o endereço do repositório no formato https://github.com/seu-usuario/lazulium-perfil.');
  return { owner: match[1], repo: match[2], cleanUrl: `https://github.com/${match[1]}/${match[2]}` };
}

function pageUrlFor(repoUrl: string): string {
  const { owner, repo } = parseRepo(repoUrl);
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
}

function pageTemplatePath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'web-profile', 'index.html') : join(app.getAppPath(), 'web', 'profile', 'index.html');
}

function siteDir(): string {
  return join(app.getPath('userData'), 'profile-site');
}

// Transforma a saída do Git numa instrução do que fazer
function friendlyGitError(err: NodeJS.ErrnoException & { stderr?: string }): Error {
  if (err.code === 'ENOENT') return new Error('O Git não está instalado. Instale pelo site git-scm.com e clique em Publicar de novo.');
  const detail = err.stderr ?? err.message ?? '';
  if (/repository not found|not found|does not exist/i.test(detail)) return new Error('Repositório não encontrado. Confira o endereço e se você já o criou no GitHub.');
  if (/authentication|could not read username|permission|denied|403/i.test(detail)) return new Error('O GitHub não autorizou o envio. Confira se o endereço está certo e se o repositório é seu; depois clique em Publicar e entre na janela de login do Git.');
  if (/could not resolve host|unable to access|timed out/i.test(detail)) return new Error('Não foi possível falar com o GitHub. Confira a internet e clique em Publicar de novo.');
  console.warn('[ProfileWeb] Falha no Git:', detail);
  return new Error('O envio ao GitHub falhou. Clique em Publicar de novo; se continuar, abra a pasta de logs em Configurações.');
}

class ProfileWebService {
  private publishing = false;

  getStatus(): ProfileWebStatus {
    const saved = db.getProfileWeb();
    return saved?.repoUrl ? { ...saved, pageUrl: pageUrlFor(saved.repoUrl) } : {};
  }

  disconnect(): ProfileWebStatus {
    db.setProfileWeb(undefined);
    return {};
  }

  private async git(args: string[], cwd?: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true, timeout: GIT_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      return stdout.trim();
    } catch (err) {
      throw friendlyGitError(err as NodeJS.ErrnoException & { stderr?: string });
    }
  }

  private async succeeds(args: string[], cwd: string): Promise<boolean> {
    return this.git(args, cwd).then(
      () => true,
      () => false
    );
  }

  // Cópia local do site, só do app: sempre parte do que está no GitHub, e só os arquivos da página mudam
  private async prepareClone(repoUrl: string): Promise<string> {
    const dir = siteDir();
    const sameRemote = existsSync(join(dir, '.git')) && (await this.git(['remote', 'get-url', 'origin'], dir).catch(() => '')) === repoUrl;
    if (!sameRemote) {
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      await this.git(['clone', repoUrl, dir]);
    }
    await this.git(['fetch', 'origin'], dir);
    if (await this.succeeds(['rev-parse', '--verify', `origin/${BRANCH}`], dir)) await this.git(['checkout', '-f', '-B', BRANCH, `origin/${BRANCH}`], dir);
    else await this.git(['symbolic-ref', 'HEAD', `refs/heads/${BRANCH}`], dir);
    return dir;
  }

  async publish(repoInput?: string): Promise<ProfileWebStatus> {
    if (this.publishing) throw new Error('A publicação já está em andamento.');
    const repoUrl = parseRepo(repoInput ?? db.getProfileWeb()?.repoUrl ?? '').cleanUrl;
    this.publishing = true;
    try {
      const dir = await this.prepareClone(repoUrl);
      const profile = profileService.toExportable(await profileService.build());
      await copyFile(pageTemplatePath(), join(dir, 'index.html'));
      await writeFile(join(dir, 'lazulium-perfil.json'), JSON.stringify(profile, null, 2), 'utf-8');
      await writeFile(join(dir, '.nojekyll'), '');
      await this.git(['add', '--', 'index.html', 'lazulium-perfil.json', '.nojekyll'], dir);
      if (!(await this.succeeds(['diff', '--cached', '--quiet'], dir))) {
        await this.git([...COMMIT_IDENTITY, 'commit', '-m', 'Atualiza o perfil'], dir);
      }
      await this.git(['push', 'origin', BRANCH], dir);
      db.setProfileWeb({ repoUrl, lastPublishedAt: new Date().toISOString() });
      return this.getStatus();
    } finally {
      this.publishing = false;
    }
  }
}

export const profileWebService = new ProfileWebService();
