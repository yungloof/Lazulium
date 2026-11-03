import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  FolderPlus,
  HardDrive,
  History,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  X
} from 'lucide-react';
import { Game } from '@shared/types/game';
import {
  BackupRecord,
  BackupReason,
  DriveStatus,
  GameSaveConfig,
  SaveLocation,
  SaveLocationSuggestion
} from '@shared/types/cloudsync';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface SaveBackupPanelProps {
  game: Game;
  onClose: () => void;
  onOpenSettings: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const REASON_LABEL: Record<BackupReason, string> = {
  auto: 'Automático',
  manual: 'Manual',
  'pre-restore': 'Antes de restaurar'
};

type Feedback = { tone: 'ok' | 'warn'; text: string } | null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function sameLocation(a: SaveLocation, b: SaveLocation): boolean {
  return a.path.toLowerCase() === b.path.toLowerCase() && (a.filePrefix ?? '').toLowerCase() === (b.filePrefix ?? '').toLowerCase();
}

export const SaveBackupPanel: React.FC<SaveBackupPanelProps> = ({ game, onClose, onOpenSettings }) => {
  const [config, setConfig] = useState<GameSaveConfig>({ locations: [], autoBackup: true });
  const [suggestions, setSuggestions] = useState<SaveLocationSuggestion[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [driveError, setDriveError] = useState<string | undefined>();
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmLatest, setConfirmLatest] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const result = await window.electronAPI?.listSaveBackups(game.id);
    setBackups(result?.backups ?? []);
    setDriveError(result?.driveError);
    setSharedWith(result?.sharedWith ?? []);
    setLoadingHistory(false);
  }, [game.id]);

  const detect = useCallback(async () => {
    setDetecting(true);
    setSuggestions((await window.electronAPI?.detectSaveLocations(game.id)) ?? []);
    setDetecting(false);
  }, [game.id]);

  useEffect(() => {
    window.electronAPI?.getSaveConfig(game.id).then((saved) => saved && setConfig(saved));
    window.electronAPI?.getDriveStatus().then(setDrive);
    detect();
    loadHistory();
  }, [game.id, detect, loadHistory]);

  // Backup automático terminou enquanto o painel estava aberto
  useEffect(() => {
    return window.electronAPI?.onBackupEvent((event) => {
      if (event.gameId === game.id && event.state !== 'started') loadHistory();
    });
  }, [game.id, loadHistory]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveConfig = async (next: GameSaveConfig) => {
    setFeedback(null);
    try {
      setConfig((await window.electronAPI?.setSaveConfig(game.id, next)) ?? next);
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    }
  };

  const addLocation = (location: SaveLocation) => {
    if (config.locations.some((l) => sameLocation(l, location))) return;
    saveConfig({ ...config, locations: [...config.locations, { path: location.path, filePrefix: location.filePrefix }] });
  };

  const handleAddFolder = async () => {
    const path = await window.electronAPI?.selectDirectory();
    if (path) addLocation({ path });
  };

  const handleBackup = async () => {
    setBusy('backup');
    setFeedback(null);
    try {
      const record = await window.electronAPI?.backupSaves(game.id);
      setFeedback({
        tone: record?.driveError ? 'warn' : 'ok',
        text: record?.driveError
          ? `Backup salvo neste PC, mas o envio ao Drive falhou: ${record.driveError}`
          : `Backup concluído: ${record?.fileCount} arquivo(s)${record?.driveFileId ? ', enviado ao Google Drive' : ''}.`
      });
      await loadHistory();
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (backupId: string) => {
    setBusy('restore');
    setRestoringId(backupId);
    setConfirmRestoreId(null);
    setFeedback(null);
    try {
      const result = await window.electronAPI?.restoreSaveBackup(game.id, backupId);
      setFeedback({
        tone: 'ok',
        text: `${result?.restoredFiles} arquivo(s) restaurados.${result?.safetyBackupId ? ' Os saves anteriores foram guardados no histórico.' : ''}`
      });
      await loadHistory();
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
      setRestoringId(null);
    }
  };

  // Backups salvos aqui que não chegaram ao Drive (sem internet, conexão expirada)
  const notUploaded = backups.filter((b) => b.driveError && !b.driveFileId && b.localPath).length;

  const handleRetryUploads = async () => {
    setRetrying(true);
    setFeedback(null);
    try {
      const sent = (await window.electronAPI?.retryDriveUploads()) ?? 0;
      await loadHistory();
      setFeedback(
        sent > 0
          ? { tone: 'ok', text: `${sent} backup(s) enviado(s) ao Google Drive.` }
          : { tone: 'warn', text: 'Ainda não foi possível enviar. Verifique a internet ou reconecte o Google Drive.' }
      );
    } catch (err) {
      setFeedback({ tone: 'warn', text: ipcErrorMessage(err) });
    } finally {
      setRetrying(false);
    }
  };

  // Restaurar antes vira histórico também: o "mais recente" é sempre um save de verdade
  const latest = backups.find((b) => b.reason !== 'pre-restore');

  const pendingSuggestions = suggestions.filter((s) => !config.locations.some((l) => sameLocation(l, s)));
  const suggestionFor = (location: SaveLocation) => suggestions.find((s) => sameLocation(s, location));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-lg bg-steam-bg border border-slate-800 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 truncate">
            <Save className="w-4 h-4 text-sky-400 flex-shrink-0" /> Saves · {game.title}
          </h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Status do Drive */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-xs">
            {drive?.connected ? (
              <span className="flex items-center gap-2 text-emerald-300">
                <Cloud className="w-3.5 h-3.5" /> Google Drive conectado{drive.email ? ` · ${drive.email}` : ''}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-slate-400">
                <CloudOff className="w-3.5 h-3.5" /> Google Drive não conectado: os backups automáticos ficam só neste PC
              </span>
            )}
            {!drive?.connected && (
              <button
                onClick={onOpenSettings}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-indigo-300 hover:bg-indigo-500/10 ${focusRing}`}
              >
                <Settings className="w-3.5 h-3.5" /> Conectar
              </button>
            )}
          </div>

          {/* Puxar o save em um clique */}
          {latest && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-400/30">
              <div className="min-w-0">
                <p className="text-sm text-white">Último backup: {formatDate(latest.createdAt)}</p>
                <p className="mt-0.5 text-xs text-slate-300">
                  {latest.fileCount} arquivo(s) · {formatBytes(latest.sizeBytes)} · {latest.driveFileId ? 'neste PC e no Drive' : latest.localPath ? 'neste PC' : 'no Drive'}
                </p>
              </div>
              {confirmLatest ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-300">Os saves atuais vão para o histórico antes.</span>
                  <button
                    onClick={() => {
                      setConfirmLatest(false);
                      void handleRestore(latest.id);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}
                  >
                    Confirmar
                  </button>
                  <button onClick={() => setConfirmLatest(false)} className={`px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmLatest(true)} disabled={busy !== null} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
                  {busy === 'restore' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Restaurar o mais recente
                </button>
              )}
            </div>
          )}

          {sharedWith.length > 0 && (
            <p className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Este emulador guarda os saves de vários jogos na mesma pasta. Restaurar aqui volta também os de: {sharedWith.join(', ')}.</span>
            </p>
          )}

          {/* Pastas de saves */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Pastas de saves</h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={detect}
                  disabled={detecting}
                  className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-50 ${focusRing}`}
                >
                  <RefreshCw className={`w-3 h-3 ${detecting ? 'animate-spin' : ''}`} /> Detectar
                </button>
                <button
                  onClick={handleAddFolder}
                  className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 ${focusRing}`}
                >
                  <FolderPlus className="w-3 h-3" /> Adicionar pasta
                </button>
              </div>
            </div>

            {config.locations.length === 0 && (
              <p className="text-xs text-slate-500">
                Nenhuma pasta definida ainda: o Lazulium procura sozinho ao fechar o jogo e uma vez por dia. Se o jogo salva em outro lugar, escolha a pasta aqui.
              </p>
            )}
            {config.locations.map((location) => {
              const info = suggestionFor(location);
              return (
                <div
                  key={`${location.path}|${location.filePrefix ?? ''}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sky-500/5 border border-sky-500/20"
                >
                  <HardDrive className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-200 truncate" title={location.path}>
                      {location.path}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {location.filePrefix ? `Somente arquivos "${location.filePrefix}*" · ` : ''}
                      {info ? `${info.fileCount} arquivo(s) · ${formatBytes(info.sizeBytes)}` : 'Pasta escolhida manualmente'}
                    </p>
                  </div>
                  <button
                    onClick={() => saveConfig({ ...config, locations: config.locations.filter((l) => !sameLocation(l, location)) })}
                    className={`p-1 rounded text-slate-500 hover:text-red-300 hover:bg-red-500/10 ${focusRing}`}
                    title="Remover pasta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {pendingSuggestions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] text-slate-500">Sugestões encontradas:</p>
                {pendingSuggestions.map((s) => (
                  <div
                    key={`${s.path}|${s.filePrefix ?? ''}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/60 border border-dashed border-slate-700"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-300 truncate" title={s.path}>
                        {s.label}
                        {s.confidence === 'high' && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[9px] font-bold uppercase">
                            Confiável
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate" title={s.path}>
                        {s.fileCount} arquivo(s) · {formatBytes(s.sizeBytes)} · {s.path}
                      </p>
                    </div>
                    <button
                      onClick={() => addLocation(s)}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}
                    >
                      <Plus className="w-3 h-3" /> Usar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.autoBackup}
                  onChange={(e) => saveConfig({ ...config, autoBackup: e.target.checked })}
                  className={`w-4 h-4 accent-indigo-500 rounded ${focusRing}`}
                />
                Backup automático: ao fechar o jogo e uma vez por dia
              </label>
              <button
                onClick={handleBackup}
                disabled={config.locations.length === 0 || busy !== null}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}
              >
                {busy === 'backup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Fazer backup agora
              </button>
            </div>
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

          {/* Histórico */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <History className="w-3.5 h-3.5 text-slate-400" /> Histórico de backups
            </h3>
            {driveError && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle className="w-3 h-3" /> Não foi possível listar os backups do Drive: {driveError}
              </p>
            )}
            {notUploaded > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                <span className="flex items-center gap-1.5">
                  <CloudOff className="w-3.5 h-3.5 flex-shrink-0" /> {notUploaded} backup(s) estão só neste PC (o envio ao Drive falhou).
                </span>
                {drive?.connected ? (
                  <button
                    onClick={handleRetryUploads}
                    disabled={retrying}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold flex-shrink-0 disabled:opacity-50 ${focusRing}`}
                  >
                    {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Tentar enviar de novo
                  </button>
                ) : (
                  <button
                    onClick={onOpenSettings}
                    className={`px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold flex-shrink-0 ${focusRing}`}
                  >
                    Reconectar o Drive
                  </button>
                )}
              </div>
            )}
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
              </div>
            ) : backups.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">Nenhum backup ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200">
                        {formatDate(b.createdAt)}
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">{REASON_LABEL[b.reason]}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono" title={`SHA-256: ${b.sha256}`}>
                        {b.fileCount} arquivo(s) · {formatBytes(b.sizeBytes)} · sha256 {b.sha256.slice(0, 12)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      {b.localPath && (
                        <span title="Salvo neste PC">
                          <HardDrive className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {b.driveFileId ? (
                        <span title="Enviado ao Google Drive">
                          <Cloud className="w-3.5 h-3.5 text-sky-400" />
                        </span>
                      ) : b.driveError ? (
                        <span title={`Falha no envio ao Drive: ${b.driveError}`}>
                          <CloudOff className="w-3.5 h-3.5 text-amber-400" />
                        </span>
                      ) : null}
                    </div>
                    {confirmRestoreId === b.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRestore(b.id)}
                          className={`px-2 py-1 text-[11px] font-semibold rounded bg-amber-500 hover:bg-amber-400 text-black ${focusRing}`}
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmRestoreId(null)}
                          className={`px-2 py-1 text-[11px] rounded text-slate-400 hover:bg-slate-800 ${focusRing}`}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRestoreId(b.id)}
                        disabled={busy !== null || !!game.isRunning}
                        title={game.isRunning ? 'Feche o jogo para restaurar' : 'Restaurar este save'}
                        className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 ${focusRing}`}
                      >
                        {restoringId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Restaurar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {confirmRestoreId && (
              <p className="text-[11px] text-amber-300/90">
                Os arquivos do backup vão sobrescrever os saves atuais. Antes disso, o Lazulium guarda uma cópia dos saves atuais no histórico.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
