import React, { useState } from 'react';
import { ListPlus } from 'lucide-react';
import { GameList } from '@shared/types/lists';
import { useListsStore } from '../../stores/useListsStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Button, Modal, Notice, focusRing, hintClass, inputClass, labelClass } from '../ui';
import { SettingsGroup, ToggleRow } from '../settings/controls';

const year = new Date().getFullYear();
export const LIST_IDEAS = [`Melhores de ${year}`, 'Zerar nas férias', 'Favoritos de todos os tempos', 'Para jogar com os amigos', 'Indicações para quem está começando'];

// Nova lista em um passo: nome (ou uma ideia pronta), descrição e as duas opções. Depois é só escolher os jogos.
export const CreateListModal: React.FC<{ initialTitle?: string; onClose: () => void; onCreated: (list: GameList) => void }> = ({ initialTitle = '', onClose, onCreated }) => {
  const save = useListsStore((s) => s.save);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [ranked, setRanked] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const list = await save({ title: title.trim(), description: description.trim() || undefined, ranked, featured });
      if (list) onCreated(list);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Nova lista"
      icon={<ListPlus className="w-4 h-4 text-indigo-400" />}
      size="md"
      onClose={onClose}
      onSubmit={() => void create()}
      footer={
        <>
          <Notice className="mr-auto">{error}</Notice>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={saving} disabled={!title.trim()}>
            Criar e escolher jogos
          </Button>
        </>
      }
    >
      <label className="block">
        <span className={labelClass}>Nome</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ex.: Melhores de todos os tempos" className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-1.5" aria-label="Ideias de lista">
        {LIST_IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => setTitle(idea)}
            className={`h-7 px-2.5 rounded-full border text-xs transition-colors ${title === idea ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'} ${focusRing}`}
          >
            {idea}
          </button>
        ))}
      </div>
      <label className="block">
        <span className={labelClass}>Descrição</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} placeholder="Do que se trata (opcional)" className={`${inputClass} resize-none`} />
        <span className={hintClass}>Aparece no cartão da lista e no seu perfil.</span>
      </label>
      <SettingsGroup>
        <ToggleRow label="Ranqueada" hint="Mostra a posição de cada jogo: 1º, 2º, 3º..." checked={ranked} onChange={setRanked} />
        <ToggleRow label="Destacar no Perfil" hint="Aparece na visão geral do seu perfil." checked={featured} onChange={setFeatured} />
      </SettingsGroup>
    </Modal>
  );
};
