import React, { useState } from 'react';
import { LayoutList, ListOrdered, ListPlus } from 'lucide-react';
import { defaultTiers } from '@shared/utils/tier-list';
import { GameList } from '@shared/types/lists';
import { useListsStore } from '../../stores/useListsStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Button, Modal, Notice, focusRing, hintClass, inputClass, labelClass } from '../ui';
import { SettingsGroup, ToggleRow } from '../settings/controls';

const year = new Date().getFullYear();
const TIER_IDEAS = ['Tier list de todos os jogos', `Tier list de ${year}`, 'Tier list de jogos de terror', 'Tier list de indies'];
export const LIST_IDEAS = [`Melhores de ${year}`, 'Zerar nas férias', 'Favoritos de todos os tempos', 'Para jogar com os amigos', 'Indicações para quem está começando'];

// Nova lista em um passo: tipo (lista ou tier list), nome (ou uma ideia pronta), descrição e as opções. Depois é só escolher os jogos.
export const CreateListModal: React.FC<{ initialTitle?: string; initialKind?: 'list' | 'tier'; onClose: () => void; onCreated: (list: GameList) => void }> = ({
  initialTitle = '',
  initialKind = 'list',
  onClose,
  onCreated
}) => {
  const save = useListsStore((s) => s.save);
  const [kind, setKind] = useState<'list' | 'tier'>(initialKind);
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
      const list = await save({
        title: title.trim(),
        description: description.trim() || undefined,
        ranked: kind === 'list' && ranked,
        featured,
        ...(kind === 'tier' ? { tiers: defaultTiers(() => crypto.randomUUID()) } : {})
      });
      if (list) onCreated(list);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={kind === 'tier' ? 'Nova tier list' : 'Nova lista'}
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
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
        {(
          [
            { id: 'list', label: 'Lista', hint: 'Jogos em sequência, com ou sem posição', Icon: ListOrdered },
            { id: 'tier', label: 'Tier list', hint: 'Fileiras S, A, B, C, D como no TierMaker', Icon: LayoutList }
          ] as const
        ).map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={kind === id}
            onClick={() => setKind(id)}
            className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors ${kind === id ? 'border-indigo-400 bg-indigo-500/15' : 'border-slate-700 hover:border-slate-500'} ${focusRing}`}
          >
            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${kind === id ? 'text-indigo-300' : 'text-slate-500'}`} />
            <span>
              <span className="block text-sm font-medium text-white">{label}</span>
              <span className="block text-xs text-slate-400">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <label className="block">
        <span className={labelClass}>Nome</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ex.: Melhores de todos os tempos" className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-1.5" aria-label="Ideias de lista">
        {(kind === 'tier' ? TIER_IDEAS : LIST_IDEAS).map((idea) => (
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
        {kind === 'list' && <ToggleRow label="Ranqueada" hint="Mostra a posição de cada jogo: 1º, 2º, 3º..." checked={ranked} onChange={setRanked} />}
        <ToggleRow label="Destacar no Perfil" hint="Aparece na visão geral do seu perfil." checked={featured} onChange={setFeatured} />
      </SettingsGroup>
    </Modal>
  );
};
