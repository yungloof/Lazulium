import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ImagePlus, Loader2, Search, X } from 'lucide-react';
import { PlayerProfile, ProfileBackgroundMode, ProfileCustom, ProfileMediaKind, ProfileSectionId } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Select } from './Select';

interface ProfileEditModalProps {
  profile: PlayerProfile;
  onClose: () => void;
  onSaved: () => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const inputClass = `w-full px-3 py-2 text-sm bg-slate-900/80 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 ${focusRing}`;
const labelClass = 'block text-xs font-semibold text-slate-300 mb-1.5';
const selectClass = `${inputClass} flex items-center justify-between gap-2 text-left hover:border-slate-600`;
const MAX_FEATURED = 12;

export const SECTION_LABEL: Record<ProfileSectionId, string> = {
  artwork: 'Arte em destaque',
  featured: 'Jogos em destaque',
  reviews: 'Resenhas',
  lists: 'Listas',
  activity: 'Atividade recente',
  achievements: 'Vitrine de conquistas',
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

  const pickMedia = async (kind: ProfileMediaKind) => {
    setError(null);
    try {
      const url = await window.electronAPI?.pickProfileMedia(kind);
      if (!url) return;
      if (kind === 'avatar') update({ avatarUrl: url });
      if (kind === 'background') update({ backgroundUrl: url, backgroundMode: 'file' });
      if (kind === 'artwork') update({ artworkUrl: url });
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const steam = profile.steam;
  const backgroundMode: ProfileBackgroundMode = form.backgroundMode ?? (steam?.background ? 'steam' : 'game');
  const previewArt = form.artworkUrl || steam?.showcaseArt?.imageUrl;

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
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg bg-steam-panel border border-slate-800 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-base text-white">Editar perfil</h2>
          <button onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-5">
            <div className="space-y-2">
              <div className="w-24 h-24 rounded-lg bg-slate-800 border border-slate-700/80 overflow-hidden">
                {(form.avatarUrl || profile.avatarUrl) && <img src={form.avatarUrl || profile.avatarUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <button onClick={() => pickMedia('avatar')} className={`w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                <ImagePlus className="w-3 h-3" /> Trocar
              </button>
              {form.avatarUrl && (
                <button onClick={() => update({ avatarUrl: undefined })} className={`w-full py-1 text-[11px] text-slate-400 hover:text-white rounded-lg ${focusRing}`}>
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
                <textarea id="profile-bio" value={form.bio ?? ''} onChange={(e) => update({ bio: e.target.value })} rows={3} maxLength={2000} placeholder={steam?.summary || 'Do que você gosta de jogar, plataformas, o que está zerando...'} className={`${inputClass} resize-y`} />
                {steam?.summary && !form.bio && <p className="mt-1 text-[11px] text-slate-500">Vazio mostra a bio da Steam.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="profile-real-name">Nome real</label>
                  <input id="profile-real-name" value={form.realName ?? ''} onChange={(e) => update({ realName: e.target.value })} placeholder={steam?.realName} maxLength={60} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="profile-location">Local</label>
                  <input id="profile-location" value={form.location ?? ''} onChange={(e) => update({ location: e.target.value })} placeholder={steam?.location} maxLength={60} className={inputClass} />
                </div>
              </div>
              {steam?.avatarFrameUrl && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={!form.hideAvatarFrame} onChange={(e) => update({ hideAvatarFrame: !e.target.checked })} className={`w-4 h-4 accent-indigo-500 ${focusRing}`} />
                  Mostrar a moldura de avatar da Steam
                </label>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelClass} htmlFor="profile-background">Fundo</label>
            <Select
              id="profile-background"
              value={backgroundMode}
              onChange={(mode: ProfileBackgroundMode) => update({ backgroundMode: mode })}
              options={[
                ...(steam?.background ? [{ value: 'steam' as ProfileBackgroundMode, label: 'O mesmo da Steam' }] : []),
                { value: 'game' as ProfileBackgroundMode, label: 'Arte de um jogo' },
                { value: 'file' as ProfileBackgroundMode, label: 'Imagem ou vídeo meu' },
                { value: 'none' as ProfileBackgroundMode, label: 'Sem fundo' }
              ]}
              className={selectClass}
            >
              {{ steam: 'O mesmo da Steam', game: 'Arte de um jogo', file: 'Imagem ou vídeo meu', none: 'Sem fundo' }[backgroundMode]}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </Select>
            {backgroundMode === 'game' && (
              <Select
                ariaLabel="Jogo do fundo"
                value={form.bannerGameId ?? ''}
                onChange={(id) => update({ bannerGameId: id || undefined })}
                options={[{ value: '', label: 'Automático (jogo mais recente)' }, ...banners.map((g) => ({ value: g.id, label: g.title }))]}
                className={selectClass}
              >
                <span className="truncate">{banners.find((g) => g.id === form.bannerGameId)?.title ?? 'Automático (jogo mais recente)'}</span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
              </Select>
            )}
            {backgroundMode === 'file' && (
              <div className="flex items-center gap-3">
                <button onClick={() => pickMedia('background')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                  <ImagePlus className="w-3.5 h-3.5" /> Escolher arquivo
                </button>
                <span className="text-[11px] text-slate-500">{form.backgroundUrl ? 'Arquivo escolhido.' : 'PNG, JPG, WEBP, GIF, WEBM ou MP4 (vídeo até 200 MB).'}</span>
              </div>
            )}
          </div>

          <div>
            <p className={labelClass}>Arte em destaque</p>
            <div className="flex items-start gap-3">
              <div className="w-40 aspect-video flex-shrink-0 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
                {previewArt && <img src={previewArt} alt="" className="w-full h-full object-contain" />}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input aria-label="Legenda da arte" value={form.artworkCaption ?? ''} onChange={(e) => update({ artworkCaption: e.target.value })} placeholder={form.artworkUrl ? 'Legenda (opcional)' : steam?.showcaseArt?.title || 'Legenda (opcional)'} maxLength={120} className={inputClass} />
                <div className="flex items-center gap-3">
                  <button onClick={() => pickMedia('artwork')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                    <ImagePlus className="w-3.5 h-3.5" /> Escolher imagem
                  </button>
                  {form.artworkUrl && (
                    <button onClick={() => update({ artworkUrl: undefined })} className={`text-[11px] text-slate-400 hover:text-white rounded-lg ${focusRing}`}>
                      {steam?.showcaseArt ? 'Usar a da Steam' : 'Remover'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className={labelClass}>Seções do perfil</p>
            <ul className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
              {[...sections, ...ALL_SECTIONS.filter((s) => !sections.includes(s))].map((id) => {
                const on = sections.includes(id);
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer text-slate-200">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => update({ sections: on ? sections.filter((s) => s !== id) : [...sections, id] })}
                        className={`w-4 h-4 accent-indigo-500 rounded ${focusRing}`}
                      />
                      {SECTION_LABEL[id]}
                    </label>
                    <button onClick={() => moveSection(id, -1)} disabled={!on} aria-label={`Subir ${SECTION_LABEL[id]}`} className={`p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-30 ${focusRing}`}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveSection(id, 1)} disabled={!on} aria-label={`Descer ${SECTION_LABEL[id]}`} className={`p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-30 ${focusRing}`}>
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
                    className={`relative aspect-[2/3] overflow-hidden bg-slate-800 ${on ? 'ring-2 ring-indigo-400' : 'opacity-75 hover:opacity-100'} ${focusRing}`}
                  >
                    {g.media?.coverUrl ? <img src={g.media.coverUrl} alt={g.title} loading="lazy" className="w-full h-full object-contain" /> : <span className="block p-1 text-[9px] text-slate-400">{g.title}</span>}
                    {on && <Check className="absolute top-1 right-1 w-4 h-4 p-0.5 rounded-md bg-indigo-500 text-white" />}
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
                <ul className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
                  {achievementList.map((a) => {
                    const on = featuredAch.includes(a.key);
                    return (
                      <li key={a.key}>
                        <button
                          onClick={() => setForm((f) => ({ ...f, featuredAchievementKeys: toggleIn(f.featuredAchievementKeys ?? [], a.key) }))}
                          aria-pressed={on}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-left hover:bg-slate-800/40 ${on ? 'bg-indigo-500/15' : ''} ${focusRing}`}
                        >
                          {a.iconUrl && <img src={a.iconUrl} alt="" loading="lazy" className="w-8 h-8 rounded-md flex-shrink-0" />}
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

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 flex-shrink-0">
          <span className="text-xs text-amber-300 flex items-center gap-1.5">
            {error && (
              <>
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </>
            )}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={`px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className={`px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar perfil'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
