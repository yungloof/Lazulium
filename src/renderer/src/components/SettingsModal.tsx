import React, { useEffect, useState } from 'react';
import {
  Settings,
  X,
  Eye,
  EyeOff,
  KeyRound,
  ImageDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trophy,
  Gamepad2
} from 'lucide-react';
import { GoogleDriveSettings } from './GoogleDriveSettings';
import { AppBehaviorSettings } from './AppBehaviorSettings';
import { HiddenGamesSettings } from './HiddenGamesSettings';
import { BackupOverviewSettings } from './BackupOverviewSettings';
import { HelpSettings } from './HelpSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { AccountsSettings } from './AccountsSettings';

interface SettingsModalProps {
  onClose: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const SGDB_API_KEY_URL = 'https://www.steamgriddb.com/profile/preferences/api';
const STEAM_API_KEY_URL = 'https://steamcommunity.com/dev/apikey';
const RA_KEYS_URL = 'https://retroachievements.org/controlpanel.php';

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  // SteamGridDB State
  const [sgdbKey, setSgdbKey] = useState('');
  const [savedSgdbKey, setSavedSgdbKey] = useState('');
  const [showSgdbKey, setShowSgdbKey] = useState(false);
  const [busySgdb, setBusySgdb] = useState<'test' | 'save' | 'fetch' | null>(null);
  const [feedbackSgdb, setFeedbackSgdb] = useState<Feedback>(null);

  // Steam Achievements State
  const [steamKey, setSteamKey] = useState('');
  const [savedSteamKey, setSavedSteamKey] = useState('');
  const [showSteamKey, setShowSteamKey] = useState(false);
  const [steamId, setSteamId] = useState('');
  const [savedSteamId, setSavedSteamId] = useState('');
  const [busySteam, setBusySteam] = useState<'test' | 'save' | null>(null);
  const [feedbackSteam, setFeedbackSteam] = useState<Feedback>(null);

  // RetroAchievements State
  const [raUser, setRaUser] = useState('');
  const [savedRaUser, setSavedRaUser] = useState('');
  const [raKey, setRaKey] = useState('');
  const [savedRaKey, setSavedRaKey] = useState('');
  const [showRaKey, setShowRaKey] = useState(false);
  const [busyRa, setBusyRa] = useState<'test' | 'save' | null>(null);
  const [feedbackRa, setFeedbackRa] = useState<Feedback>(null);

  useEffect(() => {
    window.electronAPI?.getSettings().then((settings) => {
      const sKey = settings.steamGridDbApiKey ?? '';
      setSgdbKey(sKey);
      setSavedSgdbKey(sKey);

      const stKey = settings.steamWebApiKey ?? '';
      setSteamKey(stKey);
      setSavedSteamKey(stKey);

      const stId = settings.steamUserId ?? '';
      setSteamId(stId);
      setSavedSteamId(stId);

      const rUser = settings.retroAchievementsUser ?? '';
      setRaUser(rUser);
      setSavedRaUser(rUser);

      const rKey = settings.retroAchievementsApiKey ?? '';
      setRaKey(rKey);
      setSavedRaKey(rKey);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // --- Handlers SteamGridDB ---
  const handleTestSgdb = async () => {
    setBusySgdb('test');
    const result = await window.electronAPI?.testSteamGridDbKey(sgdbKey);
    setFeedbackSgdb(result ? { tone: result.ok ? 'ok' : 'warn', text: result.message } : null);
    setBusySgdb(null);
  };

  const handleSaveSgdb = async () => {
    setBusySgdb('save');
    const key = sgdbKey.trim();
    const result = key ? await window.electronAPI?.testSteamGridDbKey(key) : undefined;
    if (key && !result?.ok) {
      setFeedbackSgdb({ tone: 'warn', text: result?.message ?? 'Não foi possível validar a chave.' });
      setBusySgdb(null);
      return;
    }
    await window.electronAPI?.setSetting('steamGridDbApiKey', key);
    setSavedSgdbKey(key);
    setFeedbackSgdb({
      tone: 'ok',
      text: key ? 'Chave salva com sucesso e protegida com safeStorage.' : 'Chave removida.'
    });
    setBusySgdb(null);
  };

  const handleFetchMissing = async () => {
    setBusySgdb('fetch');
    const queued = (await window.electronAPI?.fetchMissingArtwork()) ?? 0;
    setFeedbackSgdb({
      tone: 'ok',
      text: queued > 0 ? `Buscando artes para ${queued} jogo(s) em segundo plano.` : 'Todos os jogos já têm capa.'
    });
    setBusySgdb(null);
  };

  // --- Handlers Steam ---
  const handleTestSteam = async () => {
    setBusySteam('test');
    const result = await window.electronAPI?.testSteamCredentials(steamKey, steamId);
    setFeedbackSteam(result ? { tone: result.ok ? 'ok' : 'warn', text: result.message } : null);
    setBusySteam(null);
  };

  const handleSaveSteam = async () => {
    setBusySteam('save');
    const key = steamKey.trim();
    const id = steamId.trim();

    if (key && id) {
      const result = await window.electronAPI?.testSteamCredentials(key, id);
      if (!result?.ok) {
        setFeedbackSteam({ tone: 'warn', text: result?.message ?? 'Credenciais da Steam inválidas.' });
        setBusySteam(null);
        return;
      }
    }

    await window.electronAPI?.setSetting('steamWebApiKey', key);
    await window.electronAPI?.setSetting('steamUserId', id);
    setSavedSteamKey(key);
    setSavedSteamId(id);
    setFeedbackSteam({
      tone: 'ok',
      text: key && id ? 'Credenciais da Steam salvas e chave Web API cifrada com safeStorage.' : 'Configurações da Steam atualizadas.'
    });
    setBusySteam(null);
  };

  // --- Handlers RetroAchievements ---
  const handleTestRa = async () => {
    setBusyRa('test');
    const result = await window.electronAPI?.testRetroAchievementsCredentials(raUser, raKey);
    setFeedbackRa(result ? { tone: result.ok ? 'ok' : 'warn', text: result.message } : null);
    setBusyRa(null);
  };

  const handleSaveRa = async () => {
    setBusyRa('save');
    const user = raUser.trim();
    const key = raKey.trim();

    if (user && key) {
      const result = await window.electronAPI?.testRetroAchievementsCredentials(user, key);
      if (!result?.ok) {
        setFeedbackRa({ tone: 'warn', text: result?.message ?? 'Credenciais do RetroAchievements inválidas.' });
        setBusyRa(null);
        return;
      }
    }

    await window.electronAPI?.setSetting('retroAchievementsUser', user);
    await window.electronAPI?.setSetting('retroAchievementsApiKey', key);
    setSavedRaUser(user);
    setSavedRaKey(key);
    setFeedbackRa({
      tone: 'ok',
      text: user && key ? 'Credenciais salvas e chave Web API cifrada com safeStorage.' : 'Configurações atualizadas.'
    });
    setBusyRa(null);
  };

  const isSteamChanged = steamKey !== savedSteamKey || steamId !== savedSteamId;
  const isRaChanged = raUser !== savedRaUser || raKey !== savedRaKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg bg-steam-bg border border-slate-800 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Settings className="w-4 h-4 text-indigo-400" /> Configurações & Integrações
          </h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6">
          <AccountsSettings />

          <AppearanceSettings />
          <AppBehaviorSettings />

          <BackupOverviewSettings />

          <HiddenGamesSettings />

          {/* Chaves manuais: só para quem prefere não usar o login (ou para depurar) */}
          <details className="group">
            <summary className="cursor-pointer select-none text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
              Avançado: chaves de API manuais
            </summary>
            <div className="space-y-6 pt-5">
          {/* Seção 1: SteamGridDB */}
          <section className="space-y-3 pb-5 border-b border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                <KeyRound className="w-3.5 h-3.5 text-indigo-400" /> SteamGridDB (Capas & Mídia)
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Gere sua chave gratuita em{' '}
              <a href={SGDB_API_KEY_URL} target="_blank" rel="noreferrer" className={`text-indigo-300 hover:underline rounded ${focusRing}`}>
                steamgriddb.com → Preferências → API
              </a>
              .
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showSgdbKey ? 'text' : 'password'}
                  value={sgdbKey}
                  onChange={(e) => {
                    setSgdbKey(e.target.value);
                    setFeedbackSgdb(null);
                  }}
                  placeholder="Cole sua chave do SteamGridDB"
                  spellCheck={false}
                  className="w-full pl-3 pr-9 py-2 text-xs font-mono bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSgdbKey((v) => !v)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-200 ${focusRing}`}
                  title={showSgdbKey ? 'Ocultar chave' : 'Mostrar chave'}
                >
                  {showSgdbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleTestSgdb}
                disabled={!sgdbKey.trim() || busySgdb !== null}
                className={`px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}
              >
                {busySgdb === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Testar'}
              </button>
              <button
                type="button"
                onClick={handleSaveSgdb}
                disabled={sgdbKey === savedSgdbKey || busySgdb !== null}
                className={`px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}
              >
                {busySgdb === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleFetchMissing}
                disabled={!savedSgdbKey || busySgdb !== null}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40 ${focusRing}`}
              >
                <ImageDown className="w-3.5 h-3.5" /> Buscar artes faltantes agora
              </button>
            </div>

            {feedbackSgdb && (
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
                  feedbackSgdb.tone === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                {feedbackSgdb.tone === 'ok' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                )}
                {feedbackSgdb.text}
              </div>
            )}
          </section>

          {/* Seção 2: Steam (Web API Key + SteamID64) */}
          <section className="space-y-3 pb-5 border-b border-slate-800/80">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5 text-amber-400" /> Steam (Conquistas PC)
            </h3>
            <p className="text-xs text-slate-500">
              Obtenha sua Web API Key em{' '}
              <a href={STEAM_API_KEY_URL} target="_blank" rel="noreferrer" className={`text-indigo-300 hover:underline rounded ${focusRing}`}>
                steamcommunity.com/dev/apikey
              </a>
              . O SteamID64 é o seu número de conta com 17 dígitos.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Steam Web API Key</label>
                <div className="relative">
                  <input
                    type={showSteamKey ? 'text' : 'password'}
                    value={steamKey}
                    onChange={(e) => {
                      setSteamKey(e.target.value);
                      setFeedbackSteam(null);
                    }}
                    placeholder="Chave de 32 caracteres hex"
                    spellCheck={false}
                    className="w-full pl-3 pr-9 py-2 text-xs font-mono bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSteamKey((v) => !v)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-200 ${focusRing}`}
                    title={showSteamKey ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    {showSteamKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">SteamID64</label>
                <input
                  type="text"
                  value={steamId}
                  onChange={(e) => {
                    setSteamId(e.target.value);
                    setFeedbackSteam(null);
                  }}
                  placeholder="Ex: 76561198000000000"
                  spellCheck={false}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestSteam}
                disabled={!steamKey.trim() || !steamId.trim() || busySteam !== null}
                className={`px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}
              >
                {busySteam === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Testar Steam'}
              </button>
              <button
                type="button"
                onClick={handleSaveSteam}
                disabled={!isSteamChanged || busySteam !== null}
                className={`px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}
              >
                {busySteam === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Steam'}
              </button>
            </div>

            {feedbackSteam && (
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
                  feedbackSteam.tone === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                {feedbackSteam.tone === 'ok' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                )}
                {feedbackSteam.text}
              </div>
            )}
          </section>

          {/* Seção 3: RetroAchievements */}
          <section className="space-y-3 pb-5 border-b border-slate-800/80">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" /> RetroAchievements (Emuladores)
            </h3>
            <p className="text-xs text-slate-500">
              Gere sua Web API Key em{' '}
              <a href={RA_KEYS_URL} target="_blank" rel="noreferrer" className={`text-indigo-300 hover:underline rounded ${focusRing}`}>
                retroachievements.org → Minha Conta → Chaves
              </a>
              .
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Nome de Usuário</label>
                <input
                  type="text"
                  value={raUser}
                  onChange={(e) => {
                    setRaUser(e.target.value);
                    setFeedbackRa(null);
                  }}
                  placeholder="Seu usuário no RA"
                  spellCheck={false}
                  className="w-full px-3 py-2 text-xs bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Web API Key</label>
                <div className="relative">
                  <input
                    type={showRaKey ? 'text' : 'password'}
                    value={raKey}
                    onChange={(e) => {
                      setRaKey(e.target.value);
                      setFeedbackRa(null);
                    }}
                    placeholder="Cole sua Web API Key"
                    spellCheck={false}
                    className="w-full pl-3 pr-9 py-2 text-xs font-mono bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRaKey((v) => !v)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-200 ${focusRing}`}
                    title={showRaKey ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    {showRaKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestRa}
                disabled={!raUser.trim() || !raKey.trim() || busyRa !== null}
                className={`px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}
              >
                {busyRa === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Testar RA'}
              </button>
              <button
                type="button"
                onClick={handleSaveRa}
                disabled={!isRaChanged || busyRa !== null}
                className={`px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}
              >
                {busyRa === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar RA'}
              </button>
            </div>

            {feedbackRa && (
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
                  feedbackRa.tone === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                {feedbackRa.tone === 'ok' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                )}
                {feedbackRa.text}
              </div>
            )}
          </section>

          {/* Seção 4: Google Drive */}
          <GoogleDriveSettings />
            </div>
          </details>

          <HelpSettings />
        </div>
      </div>
    </div>
  );
};
