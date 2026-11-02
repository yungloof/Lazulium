import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Search, X } from 'lucide-react';
import { PlayerProfile, ProfileCustom, ProfileSectionId } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface ProfileEditModalProps {
  profile: PlayerProfile;
  onClose: () => void;
  onSaved: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const inputClass = `w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-sm text-slate-100 placeholder-slate-600 ${focusRing}`;
const labelClass = 'block text-xs font-semibold text-slate-300 mb-1.5';
const MAX_FEATURED = 12;

export const SECTION_LABEL: Record<ProfileSectionId, string> = {
  featured: 'Jogos em destaque',
  achievements: 'Vitrine de conquistas',
  activity: 'Atividade recente',
  screenshots: 'Capturas',
  mostPlayed: 'Mais jogados'
};
export const ALL_SECTIONS = Object.keys(SECTION_LABEL) as ProfileSectionId[];

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ profile, onClose, onSaved }) => {
  const games = useLibraryStore((s) => s.games);
  const [form, setForm] = useState<ProfileCustom>(profile.custom);
  const [gameQuery, setGameQuery] = useState('');
  const [achievementQuery, setAchievementQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (changes: Partial<ProfileCustom>) => setForm((f) => ({ ...f, ...changes }));
  const featured = form.featuredGameIds ?? [];
  const featuredAch = form.featuredAchievementKeys ?? [];
  const sections = form.sections ?? ALL_SECTIONS;

  const gameList = useMemo(() => {
    const q = gameQuery.trim().toLowerCase();
    return games
      .filter((g) => !g.isHidden && (!q || g.title.toLowerCase().includes(q)))
      .sort((a, b) => Number(featured.includes(b.id)) - Number(featured.includes(a.id)) || (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0))
      .slice(0, 60);
  }, [games, gameQuery, featured]);

  const achievementList = useMemo(() => {
    const q = achievementQuery.trim().toLowerCase();
    return profile.achievementChoices
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.gameTitle.toLowerCase().includes(q))
      .sort((a, b) => Number(featuredAch.includes(b.key)) - Number(featuredAch.includes(a.key)))
      .slice(0, 60);
  }, [profile.achievementChoices, achievementQuery, featuredAch]);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : list.length < MAX_FEATURED ? [...list, id] : list;

  const moveSection = (id: ProfileSectionId, delta: number) => {
    const next = [...sections];
    const i = next.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    update({ sections: next });
  };

  const pickAvatar = async () => {
    setError(null);
    try {
      const url = await window.electronAPI?.pickProfileAvatar();
      if (url) update({ avatarUrl: url });
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI?.saveProfileCustom(form);
      onSaved();
      onClose();
    } catch (err) {
      setError(`Não foi possível salvar: ${ipcErrorMessage(err)}`);
      setSaving(false);
    }
  };

  const banners = useMemo(
    () => games.filter((g) => g.media?.heroUrl && !g.isHidden).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    [games]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-md bg-steam-bg border border-black/40 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/30 flex-shrink-0">
          <h2 className="text-base text-white">Editar perfil</h2>
          <button onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-sm text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-5">
            <div className="space-y-2">
              <div className="w-24 h-24 rounded-sm bg-slate-800 overflow-hidden">
                {(form.avatarUrl || profile.avatarUrl) && <img src={form.avatarUrl || profile.avatarUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <button onClick={pickAvatar} className={`w-full flex items-center justify-center gap-1 py-1 text-[11px] rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                <ImagePlus className="w-3 h-3" /> Trocar
              </button>
              {form.avatarUrl && (
                <button onClick={() => update({ avatarUrl: undefined })} className={`w-full text-[11px] text-slate-400 hover:text-white rounded-sm ${focusRing}`}>
                  Usar o da Steam
                </button>
              )}
            </div>
            <div className="space-y-3 min-w-0">
              <div>
                <label className={labelClass} htmlFor="profile-name">Nome</label>
                <input id="profile-name" value={form.displayName ?? ''} onChange={(e) => update({ displayName: e.target.value })} placeholder={profile.displayName} maxLength={60} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="profile-bio">Sobre você</label>
                <textarea id="profile-bio" value={form.bio ?? ''} onChange={(e) => update({ bio: e.target.value })} rows={3} maxLength={2000} placeholder="Do que você gosta de jogar, plataformas, o que está zerando..." className={`${inputClass} resize-y`} />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="profile-banner">Banner</label>
            <select id="profile-banner" value={form.bannerGameId ?? ''} onChange={(e) => update({ bannerGameId: e.target.value || undefined })} className={inputClass}>
              <option value="">Automático (jogo mais recente)</option>
              {banners.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className={labelClass}>Seções do perfil</p>
            <ul className="border border-black/30 rounded-sm divide-y divide-black/30">
              {[...sections, ...ALL_SECTIONS.filter((s) => !sections.includes(s))].map((id) => {
                const on = sections.includes(id);
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer text-slate-200">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => update({ sections: on ? sections.filter((s) => s !== id) : [...sections, id] })}
                        className={`w-4 h-4 accent-indigo-500 ${focusRing}`}
                      />
                      {SECTION_LABEL[id]}
                    </label>
                    <button onClick={() => moveSection(id, -1)} disabled={!on} aria-label={`Subir ${SECTION_LABEL[id]}`} className={`p-1 rounded-sm text-slate-400 hover:text-white disabled:opacity-30 ${focusRing}`}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveSection(id, 1)} disabled={!on} aria-label={`Descer ${SECTION_LABEL[id]}`} className={`p-1 rounded-sm text-slate-400 hover:text-white disabled:opacity-30 ${focusRing}`}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className={labelClass}>Jogos em destaque ({featured.length}/{MAX_FEATURED})</p>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={gameQuery} onChange={(e) => setGameQuery(e.target.value)} placeholder="Buscar jogo" className={`${inputClass} pl-8 py-1.5 text-xs`} />
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-56 overflow-y-auto p-0.5">
              {gameList.map((g) => {
                const on = featured.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => setForm((f) => ({ ...f, featuredGameIds: toggleIn(f.featuredGameIds ?? [], g.id) }))}
                    aria-pressed={on}
                    title={g.title}
                    className={`relative aspect-[2/3] rounded-sm overflow-hidden bg-slate-800 ${on ? 'ring-2 ring-indigo-400' : 'opacity-75 hover:opacity-100'} ${focusRing}`}
                  >
                    {g.media?.coverUrl ? <img src={g.media.coverUrl} alt={g.title} loading="lazy" className="w-full h-full object-cover" /> : <span className="block p-1 text-[9px] text-slate-400">{g.title}</span>}
                    {on && <Check className="absolute top-1 right-1 w-4 h-4 p-0.5 rounded-sm bg-indigo-500 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className={labelClass}>Vitrine de conquistas ({featuredAch.length}/{MAX_FEATURED})</p>
            {profile.achievementChoices.length === 0 ? (
              <p className="text-xs text-slate-500">Clique em “Atualizar conquistas” no perfil para poder escolher.</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={achievementQuery} onChange={(e) => setAchievementQuery(e.target.value)} placeholder="Buscar conquista ou jogo" className={`${inputClass} pl-8 py-1.5 text-xs`} />
                </div>
                <ul className="max-h-56 overflow-y-auto border border-black/30 rounded-sm divide-y divide-black/30">
                  {achievementList.map((a) => {
                    const on = featuredAch.includes(a.key);
                    return (
                      <li key={a.key}>
                        <button
                          onClick={() => setForm((f) => ({ ...f, featuredAchievementKeys: toggleIn(f.featuredAchievementKeys ?? [], a.key) }))}
                          aria-pressed={on}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-left hover:bg-black/20 ${on ? 'bg-indigo-500/15' : ''} ${focusRing}`}
                        >
                          {a.iconUrl && <img src={a.iconUrl} alt="" loading="lazy" className="w-8 h-8 rounded-sm flex-shrink-0" />}
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs text-slate-100 truncate">{a.name}</span>
                            <span className="block text-[11px] text-slate-500 truncate">{a.gameTitle}</span>
                          </span>
                          {typeof a.globalPercent === 'number' && <span className="text-[11px] text-slate-400">{a.globalPercent.toFixed(1).replace('.', ',')}%</span>}
                          {on && <Check className="w-4 h-4 text-indigo-300 flex-shrink-0" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-black/30 flex-shrink-0">
          <span className="text-xs text-amber-300 flex items-center gap-1.5">
            {error && (
              <>
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </>
            )}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={`px-3 py-2 text-xs rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className={`px-5 py-2 text-xs font-semibold rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar perfil'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
