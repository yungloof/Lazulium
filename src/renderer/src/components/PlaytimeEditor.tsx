import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Notice, hintClass, inputClass, labelClass } from './ui';

interface PlaytimeEditorProps {
  game: Game;
  onClose: () => void;
}

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
    hoursRef.current?.focus();
    hoursRef.current?.select();
  }, []);

  const h = Number(hours || 0);
  const m = Number(minutes || 0);
  const valid = Number.isInteger(h) && Number.isInteger(m) && h >= 0 && m >= 0 && m < 60 && h <= 100_000;

  const handleSave = async () => {
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

  const steamHours = game.id.startsWith('steam-shortcut-') ? game.sourcePlaytimeSeconds ?? 0 : 0;

  return (
    <Modal
      title="Tempo jogado"
      subtitle={game.title}
      icon={<Clock className="w-4 h-4 text-indigo-400" />}
      size="sm"
      onClose={onClose}
      onSubmit={() => void handleSave()}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={saving} disabled={!valid}>
            Salvar
          </Button>
        </>
      }
    >
      <p className="text-xs leading-relaxed text-slate-400">
        Coloque o total real, incluindo o que você jogou antes de o jogo estar aqui. As próximas sessões continuam somando a partir dele.
        {steamHours > 0 && (
          <>
            {' '}
            A Steam registrou {Math.floor(steamHours / 3600)} h {Math.floor((steamHours % 3600) / 60)} min; o que a Steam somar depois também entra.
          </>
        )}
      </p>
      <div className="flex items-end justify-center gap-3">
        <label className="flex flex-col items-center">
          <span className={labelClass}>Horas</span>
          <input ref={hoursRef} type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} className={`${inputClass} !w-24 text-center tabular-nums`} />
        </label>
        <span className="pb-2 text-lg text-slate-500">:</span>
        <label className="flex flex-col items-center">
          <span className={labelClass}>Minutos</span>
          <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${inputClass} !w-24 text-center tabular-nums`} />
        </label>
      </div>
      {!valid && <span className={`${hintClass} text-center text-amber-300`}>Use números inteiros; minutos de 0 a 59.</span>}

      <label className="block">
        <span className={labelClass}>Última vez que jogou</span>
        <input type="date" value={lastPlayedOn} onChange={(e) => setLastPlayedOn(e.target.value)} className={inputClass} />
      </label>

      <Notice>{error}</Notice>
    </Modal>
  );
};
