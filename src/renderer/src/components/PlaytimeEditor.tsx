import React, { useEffect, useRef, useState } from 'react';
import { Clock, Loader2, X, AlertTriangle } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface PlaytimeEditorProps {
  game: Game;
  onClose: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const inputClass =
  `w-24 px-3 py-2 text-sm text-center bg-slate-900/80 border border-slate-800 rounded-lg text-slate-100 ${focusRing}`;

// Ajuste manual do tempo total (ex: horas jogadas antes de usar o Lazulium)
export const PlaytimeEditor: React.FC<PlaytimeEditorProps> = ({ game, onClose }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [hours, setHours] = useState(String(Math.floor(game.totalPlaytimeSeconds / 3600)));
  const [minutes, setMinutes] = useState(String(Math.floor((game.totalPlaytimeSeconds % 3600) / 60)));
  const [lastPlayedOn, setLastPlayedOn] = useState(game.lastPlayedAt?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hoursRef.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const h = Number(hours || 0);
  const m = Number(minutes || 0);
  const valid = Number.isInteger(h) && Number.isInteger(m) && h >= 0 && m >= 0 && m < 60 && h <= 100_000;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await window.electronAPI?.setPlaytime(game.id, h * 3600 + m * 60, lastPlayedOn || undefined);
      if (updated) upsertGameLocal(updated);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <form
        onSubmit={handleSave}
        className="w-full max-w-sm rounded-lg bg-steam-bg border border-slate-800 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 truncate">
            <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" /> Tempo jogado · {game.title}
          </h2>
          <button type="button" onClick={onClose} className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Coloque o total real, incluindo o que você jogou antes de o jogo estar aqui. As próximas sessões continuam somando a partir dele.
            {game.id.startsWith('steam-shortcut-') && (game.sourcePlaytimeSeconds ?? 0) > 0 && (
              <> A Steam registrou {Math.floor((game.sourcePlaytimeSeconds ?? 0) / 3600)} h {Math.floor(((game.sourcePlaytimeSeconds ?? 0) % 3600) / 60)} min; o que a Steam somar depois também entra.</>
            )}
          </p>
          <div className="flex items-end justify-center gap-3">
            <label className="flex flex-col items-center gap-1 text-[11px] text-slate-400">
              Horas
              <input
                ref={hoursRef}
                type="number"
                min={0}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className={inputClass}
              />
            </label>
            <span className="pb-2 text-slate-500">:</span>
            <label className="flex flex-col items-center gap-1 text-[11px] text-slate-400">
              Minutos
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-[11px] text-slate-400">
            Última vez que jogou
            <input
              type="date"
              value={lastPlayedOn}
              onChange={(e) => setLastPlayedOn(e.target.value)}
              className={`mt-1 w-full px-3 py-2 text-xs bg-slate-900/80 border border-slate-800 rounded-lg text-slate-100 ${focusRing}`}
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className={`px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
