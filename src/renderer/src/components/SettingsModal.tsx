import React, { useEffect, useState } from 'react';
import { Settings, X, Eye, EyeOff, KeyRound, ImageDown, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const API_KEY_URL = 'https://www.steamgriddb.com/profile/preferences/api';

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'test' | 'save' | 'fetch' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    window.electronAPI?.getSettings().then((settings) => {
      const key = settings.steamGridDbApiKey ?? '';
      setApiKey(key);
      setSavedKey(key);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleTest = async () => {
    setBusy('test');
    const result = await window.electronAPI?.testSteamGridDbKey(apiKey);
    setFeedback(result ? { tone: result.ok ? 'ok' : 'warn', text: result.message } : null);
    setBusy(null);
  };

  const handleSave = async () => {
    setBusy('save');
    const key = apiKey.trim();
    const result = key ? await window.electronAPI?.testSteamGridDbKey(key) : undefined;
    if (key && !result?.ok) {
      setFeedback({ tone: 'warn', text: result?.message ?? 'Não foi possível validar a chave.' });
      setBusy(null);
      return;
    }
    await window.electronAPI?.setSetting('steamGridDbApiKey', key);
    setSavedKey(key);
    setFeedback({
      tone: 'ok',
      text: key ? 'Chave salva. Jogos sem capa terão artes buscadas automaticamente.' : 'Chave removida.'
    });
    setBusy(null);
  };

  const handleFetchMissing = async () => {
    setBusy('fetch');
    const queued = (await window.electronAPI?.fetchMissingArtwork()) ?? 0;
    setFeedback({
      tone: 'ok',
      text: queued > 0 ? `Buscando artes para ${queued} jogo(s) em segundo plano.` : 'Todos os jogos já têm capa.'
    });
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl bg-[#0d0f17] border border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Settings className="w-4 h-4 text-indigo-400" /> Configurações
          </h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" /> SteamGridDB
            </h3>
            <p className="text-xs text-slate-500">
              Capas, banners, logos e ícones vêm do SteamGridDB. Gere sua chave gratuita em{' '}
              <a href={API_KEY_URL} target="_blank" rel="noreferrer" className={`text-indigo-300 hover:underline rounded ${focusRing}`}>
                steamgriddb.com → Preferências → API
              </a>
              .
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setFeedback(null);
                  }}
                  placeholder="Cole sua chave de API aqui"
                  spellCheck={false}
                  className="w-full pl-3 pr-9 py-2 text-xs font-mono bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-200 ${focusRing}`}
                  title={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleTest}
                disabled={!apiKey.trim() || busy !== null}
                className={`px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}
              >
                {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Testar'}
              </button>
              <button
                onClick={handleSave}
                disabled={apiKey === savedKey || busy !== null}
                className={`px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}
              >
                {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
              </button>
            </div>

            <button
              onClick={handleFetchMissing}
              disabled={!savedKey || busy !== null}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40 ${focusRing}`}
            >
              <ImageDown className="w-3.5 h-3.5" /> Buscar artes faltantes agora
            </button>
          </section>

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
        </div>
      </div>
    </div>
  );
};
