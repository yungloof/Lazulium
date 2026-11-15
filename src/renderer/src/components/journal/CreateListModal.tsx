import React, { useEffect, useState } from 'react';
import { Check, LayoutList, ListOrdered, ListPlus, Users } from 'lucide-react';
import { defaultTiers } from '@shared/utils/tier-list';
import { GameList } from '@shared/types/lists';
import { GroupList, SocialFriend } from '@shared/types/social';
import { useGroupListsStore } from '../../stores/useGroupListsStore';
import { useListsStore } from '../../stores/useListsStore';
import { useReactionsStore } from '../../stores/useReactionsStore';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Avatar } from '../friends/parts';
import { Button, Modal, Notice, focusRing, hintClass, inputClass, labelClass } from '../ui';
import { SettingsGroup, ToggleRow } from '../settings/controls';

const year = new Date().getFullYear();
const TIER_IDEAS = ['Tier list de todos os jogos', `Tier list de ${year}`, 'Tier list de jogos de terror', 'Tier list de indies'];
export const LIST_IDEAS = [`Melhores de ${year}`, 'Zerar nas férias', 'Favoritos de todos os tempos', 'Para jogar com os amigos', 'Indicações para quem está começando'];

// Nova lista em um passo: tipo (lista ou tier list), nome (ou uma ideia pronta), descrição e as opções (inclusive em grupo com amigos).
export const CreateListModal: React.FC<{
  initialTitle?: string;
  initialKind?: 'list' | 'tier';
  initialGroup?: boolean;
  onClose: () => void;
  onCreated: (list: GameList) => void;
  onCreatedGroup?: (list: GroupList) => void;
}> = ({ initialTitle = '', initialKind = 'list', initialGroup = false, onClose, onCreated, onCreatedGroup }) => {
  const me = useReactionsStore((s) => s.me);
  const save = useListsStore((s) => s.save);
  const createGroup = useGroupListsStore((s) => s.create);
  const [kind, setKind] = useState<'list' | 'tier'>(initialKind);
  const [isGroup, setIsGroup] = useState(Boolean(initialGroup && me && initialKind === 'list'));
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [ranked, setRanked] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me || kind !== 'list' || !isGroup) return;
    let active = true;
    window.electronAPI
      ?.socialGetFriends()
      .then((items) => active && setFriends(items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [me, kind, isGroup]);

  const toggleMember = (id: string) =>
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 30) next.add(id);
      return next;
    });

  const create = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (kind === 'list' && isGroup && me) {
        const list = await createGroup({
          title: title.trim(),
          description: description.trim() || undefined,
          ranked,
          memberIds: [...selectedMembers]
        });
        if (list) onCreatedGroup?.(list);
        onClose();
        return;
      }
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

  const modalTitle = kind === 'tier' ? 'Nova tier list' : isGroup && me ? 'Nova lista em grupo' : 'Nova lista';

  return (
    <Modal
      title={modalTitle}
      icon={kind === 'list' && isGroup && me ? <Users className="w-4 h-4 text-indigo-400" /> : <ListPlus className="w-4 h-4 text-indigo-400" />}
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
            onClick={() => {
              setKind(id);
              if (id === 'tier') setIsGroup(false);
            }}
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
        <span className={hintClass}>{isGroup && me ? 'Fica visível para quem participar da lista.' : 'Aparece no cartão da lista e no seu perfil.'}</span>
      </label>
      <SettingsGroup>
        {kind === 'list' && me && (
          <ToggleRow label="Lista em grupo" hint="Amigos convidados também podem adicionar, remover e reordenar jogos." checked={isGroup} onChange={setIsGroup} />
        )}
        {kind === 'list' && <ToggleRow label="Ranqueada" hint="Mostra a posição de cada jogo: 1º, 2º, 3º..." checked={ranked} onChange={setRanked} />}
        {(!isGroup || kind === 'tier') && (
          <ToggleRow label="Destacar no Perfil" hint="Aparece na visão geral do seu perfil." checked={featured} onChange={setFeatured} />
        )}
      </SettingsGroup>
      {kind === 'list' && isGroup && me && (
        <div className="space-y-2">
          <span className={labelClass}>Convidar amigos</span>
          {friends.length === 0 ? (
            <p className={hintClass}>Você ainda não tem amigos na conta Lazulium; dá para criar a lista e convidar depois.</p>
          ) : (
            <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
              {friends.map((friend) => {
                const picked = selectedMembers.has(friend.id);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggleMember(friend.id)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-colors ${picked ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-600'} ${focusRing}`}
                  >
                    <Avatar user={friend} size="xs" />
                    <span className="flex-1 truncate">{friend.name}</span>
                    {picked && <Check className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
