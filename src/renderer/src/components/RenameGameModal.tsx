import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Notice, buttonClass, hintClass, inputClass, labelClass } from './ui';

export const RenameGameModal: React.FC<{ game: Game; onClose: () => void }> = ({ game, onClose }) => {
  const upsertGameLocal = useLibraryStore((s) => s.upsertGameLocal);
  const [title, setTitle] = useState(game.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Modal
      title="Renomear jogo"
      size="sm"
      onClose={onClose}
      onSubmit={() => title.trim() && void save(title)}
      bodyClassName="p-5 space-y-3"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={saving} disabled={!title.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <label className="block">
        <span className={labelClass}>Nome no Lazulium</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} maxLength={200} className={inputClass} />
        <span className={hintClass}>O novo nome também melhora a busca de tempo para zerar. Não muda nada na Steam nem nos arquivos do jogo.</span>
      </label>
      {game.customTitle && game.detectedTitle && (
        <button type="button" onClick={() => save(null)} disabled={saving} className={buttonClass('link')}>
          <RotateCcw className="w-3.5 h-3.5" /> Voltar ao nome original ({game.detectedTitle})
        </button>
      )}
      <Notice>{error}</Notice>
    </Modal>
  );
};
