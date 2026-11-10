import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, LogOut } from 'lucide-react';
import { DriveStatus } from '@shared/types/cloudsync';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Notice, buttonClass, labelClass } from './ui';
import { SecretInput, SettingsGroup } from './settings/controls';

const CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials';
const DRIVE_API_URL = 'https://console.cloud.google.com/apis/library/drive.googleapis.com';

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

// Client OAuth próprio do Google (Avançado): só para builds sem o login embutido
export const GoogleDriveSettings: React.FC = () => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saved, setSaved] = useState({ clientId: '', clientSecret: '' });
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState<'save' | 'connect' | 'disconnect' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    window.electronAPI
      ?.getSettings()
      .then((settings) => {
        const id = settings.googleClientId ?? '';
        const secret = settings.googleClientSecret ?? '';
        setClientId(id);
        setClientSecret(secret);
        setSaved({ clientId: id, clientSecret: secret });
      })
      .catch(() => undefined);
    window.electronAPI?.getDriveStatus().then(setStatus).catch(() => undefined);
  }, []);

  const changed = clientId !== saved.clientId || clientSecret !== saved.clientSecret;

  const saveCredentials = async () => {
    const id = clientId.trim();
    const secret = clientSecret.trim();
    await window.electronAPI?.setSetting('googleClientId', id);
    await window.electronAPI?.setSetting('googleClientSecret', secret);
    setSaved({ clientId: id, clientSecret: secret });
    setStatus((await window.electronAPI?.getDriveStatus()) ?? null);
  };

  const run = async (kind: 'save' | 'connect' | 'disconnect', work: () => Promise<Feedback>) => {
    setBusy(kind);
    try {
      setFeedback(await work());
    } catch (err) {
      setFeedback({ tone: 'error', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = () =>
    run('save', async () => {
      await saveCredentials();
      return { tone: 'success', text: 'Credenciais salvas. O Client Secret fica cifrado neste PC.' };
    });

  const handleConnect = () =>
    run('connect', async () => {
      setFeedback({ tone: 'info', text: 'Autorize o acesso na janela do navegador que abriu...' });
      if (changed) await saveCredentials();
      const result = await window.electronAPI?.connectDrive();
      setStatus(result ?? null);
      return { tone: 'success', text: `Conectado${result?.email ? ` como ${result.email}` : ''}. Os próximos backups também vão para o Drive.` };
    });

  const handleDisconnect = () =>
    run('disconnect', async () => {
      setStatus((await window.electronAPI?.disconnectDrive()) ?? null);
      return { tone: 'success', text: 'Google Drive desconectado. Os backups continuam sendo feitos neste PC.' };
    });

  return (
    <SettingsGroup
      title="Google Drive com client próprio"
      description={
        <>
          Os backups sempre ficam neste PC; com o Drive, uma cópia vai para a pasta <b className="text-slate-400">Lazulium Backups</b>. Crie um{' '}
          <a href={CREDENTIALS_URL} target="_blank" rel="noreferrer" className={buttonClass('link')}>
            ID do cliente OAuth do tipo “App para computador”
          </a>{' '}
          e ative a{' '}
          <a href={DRIVE_API_URL} target="_blank" rel="noreferrer" className={buttonClass('link')}>
            Google Drive API
          </a>
          . O Lazulium só acessa os arquivos que ele mesmo cria.
        </>
      }
    >
      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className={labelClass}>Client ID</span>
            <SecretInput
              secret={false}
              value={clientId}
              placeholder="xxxx.apps.googleusercontent.com"
              onChange={(e) => {
                setClientId(e.target.value);
                setFeedback(null);
              }}
            />
          </label>
          <label className="block min-w-0">
            <span className={labelClass}>Client Secret</span>
            <SecretInput
              value={clientSecret}
              placeholder="GOCSPX-..."
              onChange={(e) => {
                setClientSecret(e.target.value);
                setFeedback(null);
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-400">
            {status?.connected ? (
              <span className="flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectado{status.email ? ` · ${status.email}` : ''}
              </span>
            ) : (
              'Não conectado'
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} loading={busy === 'save'} disabled={!changed || busy !== null}>
              Salvar
            </Button>
            {status?.connected ? (
              <Button variant="ghost" icon={<LogOut className="w-3.5 h-3.5" />} onClick={handleDisconnect} loading={busy === 'disconnect'} disabled={busy !== null}>
                Desconectar
              </Button>
            ) : (
              <Button variant="primary" icon={<Cloud className="w-3.5 h-3.5" />} onClick={handleConnect} loading={busy === 'connect'} disabled={!clientId.trim() || !clientSecret.trim() || busy !== null}>
                Conectar Google Drive
              </Button>
            )}
          </div>
        </div>
        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      </div>
    </SettingsGroup>
  );
};
