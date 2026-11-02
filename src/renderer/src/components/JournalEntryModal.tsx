import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, NotebookPen, X } from 'lucide-react';
import { Game, GameLogStatus } from '@shared/types/game';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { StarRating, StatusSelect } from './GameLogFields';

interface JournalEntryModalProps {
  onClose: () => void;
  onAdded: (game: Game) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const inputClass = `w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-sm text-slate-200 placeholder-slate-600 ${focusRing}`;

// Jogos que o app não tem como detectar: console, outro PC, ou jogados há muito tempo
export const JournalEntryModal: React.FC<JournalEntryModalProps> = ({ onClose, onAdded }) => {
  const [title, setTitle] = useState('');
  const [manualPlatform, setManualPlatform] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [status, setStatus] = useState<GameLogStatus | undefined>('finished');
  const [rating, setRating] = useState<number | undefined>();
  const [review, setReview] = useState('');
  const [notes, setNotes] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [finishedOn, setFinishedOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const h = Number(hours || 0);
  const m = Number(minutes || 0);
  const valid = !!title.trim() && Number.isInteger(h) && Number.isInteger(m) && h >= 0 && m >= 0 && m < 60;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const game = await window.electronAPI?.addJournalEntry({
        title,
        manualPlatform,
        totalPlaytimeSeconds: h * 3600 + m * 60,
        log: { status, rating, review, notes, startedOn: startedOn || undefined, finishedOn: finishedOn || undefined }
      });
      if (game) onAdded(game);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-md bg-steam-bg border border-black/40 shadow-lg"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/30">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <NotebookPen className="w-4 h-4 text-indigo-400" /> Registrar jogo no Diário
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-sm text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-[11px] text-slate-400 overflow-y-auto">
          <p className="text-xs text-slate-500">Para jogos de console, de outro PC ou que você já zerou há tempos.</p>
          <label className="block">
            Nome do jogo
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Last of Us" className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            Onde jogou
            <input value={manualPlatform} onChange={(e) => setManualPlatform(e.target.value)} placeholder="PS5, Switch, Xbox..." className={`${inputClass} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              Horas
              <input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              Minutos
              <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" className={`${inputClass} mt-1`} />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <StatusSelect value={status} onChange={setStatus} />
            <StarRating value={rating} onChange={setRating} size="w-5 h-5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              Comecei em
              <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              Terminei em
              <input type="date" value={finishedOn} onChange={(e) => setFinishedOn(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          </div>
          <label className="block">
            Minha resenha
            <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={5} placeholder="O que achou do jogo? História, gameplay, o que ficou na memória..." className={`${inputClass} mt-1 resize-y leading-relaxed`} />
          </label>
          <label className="block">
            Anotações de progresso
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Onde parou, o que falta fazer, com quem jogou..." className={`${inputClass} mt-1 resize-y leading-relaxed`} />
          </label>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-black/30">
          <button type="button" onClick={onClose} className={`px-3 py-2 text-xs rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
            Cancelar
          </button>
          <button type="submit" disabled={!valid || saving} className={`px-4 py-2 text-xs font-semibold rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Registrar'}
          </button>
        </div>
      </form>
    </div>
  );
};
