import React, { useEffect, useState } from 'react';
import { Cloud, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, LogOut } from 'lucide-react';
import { DriveStatus } from '@shared/types/cloudsync';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials';
const DRIVE_API_URL = 'https://console.cloud.google.com/apis/library/drive.googleapis.com';

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

export const GoogleDriveSettings: React.FC = () => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saved, setSaved] = useState({ clientId: '', clientSecret: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState<'save' | 'connect' | 'disconnect' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    window.electronAPI?.getSettings().then((settings) => {
      const id = settings.googleClientId ?? '';
      const secret = settings.googleClientSecret ?? '';
      setClientId(id);
      setClientSecret(secret);
      setSaved({ clientId: id, clientSecret: secret });
    });
    window.electronAPI?.getDriveStatus().then(setStatus);
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

  const handleSave = async () => {
    setBusy('save');
    await saveCredentials();
    setFeedback({ tone: 'ok', text: 'Credenciais do OAuth salvas (Client Secret cifrado com safeStorage).' });
    setBusy(null);
  };

  const handleConnect = async () => {
    setBusy('connect');
    setFeedback({ tone: 'ok', text: 'Autorize o acesso na janela do navegador que foi aberta...' });
    try {
      if (changed) await saveCredentials();
      const result = await window.electronAPI?.connectDrive();
      setStatus(result ?? null);
      setFeedback({ tone: 'ok', text: `Conectado${result?.email ? ` como ${result.email}` : ''}. Novos backups serão enviados ao Drive.` });
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy('disconnect');
    setStatus((await window.electronAPI?.disconnectDrive()) ?? null);
    setFeedback({ tone: 'ok', text: 'Google Drive desconectado. Os backups continuam sendo feitos neste PC.' });
    setBusy(null);
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
        <Cloud className="w-3.5 h-3.5 text-sky-400" /> Google Drive (Backup de Saves)
      </h3>
      <p className="text-xs text-slate-500">
        Os backups sempre ficam neste PC; conectando o Drive, uma cópia vai para a pasta <b>Lazulium Backups</b>. Crie um{' '}
        <a href={CREDENTIALS_URL} target="_blank" rel="noreferrer" className={`text-indigo-300 hover:underline rounded ${focusRing}`}>
          ID do cliente OAuth do tipo &quot;App para computador&quot;
        </a>{' '}
        e ative a{' '}
        <a href={DRIVE_API_URL} target="_blank" rel="noreferrer" className={`text-indigo-300 hover:underline rounded ${focusRing}`}>
          Google Drive API
        </a>
        . O Lazulium só acessa os arquivos que ele mesmo cria.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setFeedback(null);
            }}
            placeholder="xxxx.apps.googleusercontent.com"
            spellCheck={false}
            className="w-full px-3 py-2 text-xs font-mono bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Client Secret</label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={clientSecret}
              onChange={(e) => {
                setClientSecret(e.target.value);
                setFeedback(null);
              }}
              placeholder="GOCSPX-..."
              spellCheck={false}
              className="w-full pl-3 pr-9 py-2 text-xs font-mono bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-200 ${focusRing}`}
              title={showSecret ? 'Ocultar' : 'Mostrar'}
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
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
          <button
            type="button"
            onClick={handleSave}
            disabled={!changed || busy !== null}
            className={`px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}
          >
            {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
          </button>
          {status?.connected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy !== null}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-200 hover:text-red-300 disabled:opacity-50 ${focusRing}`}
            >
              {busy === 'disconnect' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={!clientId.trim() || !clientSecret.trim() || busy !== null}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}
            >
              {busy === 'connect' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
              Conectar Google Drive
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
            feedback.tone === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {feedback.tone === 'ok' ? (
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          )}
          {feedback.text}
        </div>
      )}
    </section>
  );
};
