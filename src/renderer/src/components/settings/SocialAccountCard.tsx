import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, Pencil, Trash2, UserRound, Users } from 'lucide-react';
import { SocialSettings } from '@shared/types/social';
import { useSocial } from '../../hooks/useSocial';
import { useUiStore } from '../../stores/useUiStore';
import { Avatar } from '../friends/parts';
import { Button, Notice, inputClass } from '../ui';
import { ToggleRow } from './controls';

const SHARE_OPTIONS: { key: keyof SocialSettings; label: string; hint: string }[] = [
  { key: 'shareActivity', label: 'Mostrar minha atividade aos amigos', hint: 'Chave geral do feed: desligada, nada do que você faz aparece para eles.' },
  { key: 'shareNowPlaying', label: 'Jogando agora', hint: 'Seus amigos veem o jogo aberto neste momento.' },
  { key: 'sharePlaytime', label: 'Horas jogadas', hint: '"Jogou X por 2 h" e as horas no seu perfil.' },
  { key: 'shareAchievements', label: 'Conquistas', hint: 'Conquistas do dia e jogos com todas as conquistas.' },
  { key: 'shareReviews', label: 'Notas e resenhas', hint: 'As notas e o texto que você escreve no Diário.' }
];

// Quem você é no Lazulium: sem conta, o perfil fica só neste PC; com conta (entrando com a Steam), amigos e feed
export const SocialAccountCard: React.FC<{ fallbackName?: string }> = ({ fallbackName }) => {
  const social = useSocial();
  const [localProfile, setLocalProfile] = useState<{ name: string; avatarUrl?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notifyPlaying, setNotifyPlaying] = useState(true);

  useEffect(() => {
    window.electronAPI
      ?.getSettings()
      .then((s) => setNotifyPlaying(s.socialNotifyPlaying !== 'false'))
      .catch(() => undefined);
  }, []);
  const toggleNotify = (checked: boolean) => {
    setNotifyPlaying(checked);
    void window.electronAPI?.setSetting('socialNotifyPlaying', String(checked));
  };

  useEffect(() => {
    let alive = true;
    window.electronAPI
      ?.getPlayerProfile()
      .then((p) => {
        if (alive && p) setLocalProfile({ name: p.displayName, avatarUrl: p.avatarUrl });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const status = social.status;
  const box = 'rounded-xl bg-gradient-to-r from-indigo-500/15 to-slate-900/40 border border-indigo-400/20';

  if (!status?.connected || !status.user || !status.settings) {
    return (
      <div className={`${box} px-4 py-3.5`}>
        <div className="flex items-center gap-4">
          {localProfile?.avatarUrl ? (
            <img src={localProfile.avatarUrl} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <span className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
              <UserRound className="w-6 h-6 text-slate-400" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-100 truncate">{localProfile?.name || fallbackName || 'Jogador'}</p>
            <p className="text-xs text-slate-400">Seu perfil está só neste PC. Com a conta Lazulium, seus amigos veem o que você joga, e você vê o deles.</p>
          </div>
          <Button variant="primary" icon={<LogIn className="w-3.5 h-3.5" />} loading={social.busy === 'login'} onClick={() => void social.login()}>
            Conta Lazulium
          </Button>
        </div>
        {social.busy === 'login' && <p className="mt-2 pl-16 text-xs text-indigo-300">Entre com a Steam no navegador que abriu e volte para cá.</p>}
        {social.error && <Notice className="mt-2">{social.error}</Notice>}
      </div>
    );
  }

  const { user, settings } = status;
  const saveName = async () => {
    if (await social.rename(name.trim() || null)) setEditing(false);
  };

  return (
    <div className={box}>
      <div className="flex items-center gap-4 px-4 py-3.5">
        <Avatar user={user} size="md" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="Nome para os amigos" className={inputClass} aria-label="Nome para os amigos" />
              <Button type="submit" variant="primary" loading={social.busy === 'rename'}>
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <p className="flex items-center gap-2 text-base font-semibold text-slate-100 truncate">
              {user.name}
              <button
                type="button"
                onClick={() => {
                  setName(user.name);
                  setEditing(true);
                }}
                aria-label="Mudar o nome que os amigos veem"
                title="Mudar o nome que os amigos veem"
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-emerald-300">
            <Users className="w-3 h-3" /> Conta Lazulium conectada pela Steam
          </p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={() => useUiStore.getState().setView('friends')}>Amigos</Button>
            <Button variant="ghost" icon={<LogOut className="w-3.5 h-3.5" />} loading={social.busy === 'logout'} onClick={() => void social.logout()}>
              Sair
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-indigo-400/10 divide-y divide-slate-800/70">
        {SHARE_OPTIONS.map((option) => (
          <ToggleRow
            key={option.key}
            label={option.label}
            hint={option.hint}
            checked={settings[option.key]}
            disabled={social.busy !== null || (option.key !== 'shareActivity' && option.key !== 'shareNowPlaying' && !settings.shareActivity)}
            onChange={(checked) => void social.setSetting(option.key, checked)}
          />
        ))}
        <ToggleRow
          label="Avisar quando um amigo começar a jogar"
          hint="Um aviso no Lazulium (ou do Windows, com o app minimizado). Vale só neste PC."
          checked={notifyPlaying}
          onChange={toggleNotify}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-indigo-400/10 px-4 py-3">
        {status.syncError && <Notice className="w-full">Não foi possível enviar suas atividades: {status.syncError}</Notice>}
        {social.error && <Notice className="w-full">{social.error}</Notice>}
        <p className="text-xs text-slate-500 mr-auto">Só seus amigos veem. Apagar a conta remove tudo do servidor na hora; o que está neste PC continua.</p>
        {confirmDelete ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} loading={social.busy === 'delete'} onClick={() => void social.deleteAccount().then(() => setConfirmDelete(false))}>
              Apagar de vez
            </Button>
          </>
        ) : (
          <Button variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)}>
            Apagar conta Lazulium
          </Button>
        )}
      </div>
    </div>
  );
};
