import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const RenameGameModal: React.FC<{ game: Game; onClose: () => void }> = ({ game, onClose }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [title, setTitle] = useState(game.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (next: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await window.electronAPI?.renameGame(game.id, next);
      if (updated) upsertGameLocal(updated);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void save(title);
        }}
        className="w-full max-w-md rounded-lg bg-steam-panel border border-slate-800 shadow-lg"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <h2 className="text-base text-white">Renomear jogo</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="block mb-1.5 text-[13px] font-medium text-slate-300">Nome no Lazulium</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.target.select()}
              maxLength={200}
              className={`w-full px-3 py-2 text-sm bg-slate-950/60 border border-slate-700/80 rounded-lg text-slate-100 ${focusRing}`}
            />
          </label>
          <p className="text-xs text-slate-500">O novo nome também melhora a busca de tempo para zerar. Não muda nada na Steam nem nos arquivos do jogo.</p>
          {game.customTitle && game.detectedTitle && (
            <button type="button" onClick={() => save(null)} disabled={saving} className={`flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white rounded-sm ${focusRing}`}>
              <RotateCcw className="w-3.5 h-3.5" /> Voltar ao nome original ({game.detectedTitle})
            </button>
          )}
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button type="button" onClick={onClose} className={`px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
            Cancelar
          </button>
          <button type="submit" disabled={saving || !title.trim()} className={`px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
};
