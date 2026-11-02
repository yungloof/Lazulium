import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { DetectedGame, PlatformScanner, PlatformScanResult } from './scanner.types';

const execFileAsync = promisify(execFile);

// Jogos da Microsoft Store / Xbox (Game Pass) são pacotes MSIX com MicrosoftGame.config.
// Get-AppxPackage é a única forma confiável de listar os pacotes instalados para o usuário.
const LIST_PACKAGES_SCRIPT = `
$ProgressPreference = 'SilentlyContinue'
Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.InstallLocation -and (Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) } |
  ForEach-Object { [pscustomobject]@{ pfn = $_.PackageFamilyName; location = $_.InstallLocation } } | ConvertTo-Json -Compress
`;

interface PackageInfo {
  pfn: string;
  location: string;
}

function xmlAttribute(xml: string, tag: string, attribute: string): string | undefined {
  const element = xml.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'))?.[0];
  return element?.match(new RegExp(`\\b${attribute}="([^"]*)"`, 'i'))?.[1];
}

async function listGamePackages(): Promise<PackageInfo[]> {
  const encoded = Buffer.from(LIST_PACKAGES_SCRIPT, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    windowsHide: true,
    timeout: 30_000
  });
  const text = stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text) as PackageInfo | PackageInfo[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export const xboxScanner: PlatformScanner = {
  platform: 'xbox',

  async scan(): Promise<PlatformScanResult> {
    const games: DetectedGame[] = [];
    const warnings: string[] = [];

    for (const pkg of await listGamePackages()) {
      try {
        const config = await readFile(join(pkg.location, 'MicrosoftGame.config'), 'utf-8');
        const manifest = await readFile(join(pkg.location, 'AppxManifest.xml'), 'utf-8');
        const title = xmlAttribute(config, 'ShellVisuals', 'DefaultDisplayName');
        const appId = xmlAttribute(manifest, 'Application', 'Id');
        if (!title || !appId || title.startsWith('ms-resource:')) continue;

        games.push({
          id: `xbox-${pkg.pfn}`.toLowerCase(),
          title,
          platform: 'xbox',
          platformGameId: pkg.pfn,
          // explorer.exe abre o app pelo AUMID (único jeito suportado de iniciar um pacote MSIX)
          executablePath: join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'),
          launchArguments: `shell:AppsFolder\\${pkg.pfn}!${appId}`,
          installPath: pkg.location,
          opensViaLauncher: true,
          media: {}
        });
      } catch (err) {
        warnings.push(`Xbox: falha ao ler ${pkg.pfn} (${(err as Error).message})`);
      }
    }

    console.log(`[Scanner:Xbox] ${games.length} jogo(s)`);
    return { games, warnings };
  }
};
