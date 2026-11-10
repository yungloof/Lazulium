import React from 'react';
import { NotebookPen, Plus } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameList } from '@shared/types/lists';
import { PlayerProfile, ProfileSectionId } from '@shared/types/profile';
import { Button, focusRing } from '../ui';
import { CoverCard } from '../journal/CoverCard';
import { formatHours } from '../journal/format';
import { ListCard } from '../ListsPage';
import { SECTION_LABEL } from '../ProfileEditModal';
import { AchievementTile, ActivityRow, LinkButton, Panel, ReviewCard } from './parts';

const FEATURED_SIZE = 5;
const OVERVIEW_REVIEWS = 3;
const OVERVIEW_LISTS = 3;
const ACTIVITY_ROWS = 5;

interface ProfileOverviewProps {
  profile: PlayerProfile;
  sections: ProfileSectionId[];
  reviews: Game[];
  lists: GameList[];
  gamesById: Map<string, Game>;
  year: number;
  onSelectGame: (id: string) => void;
  onOpenList: (id?: string) => void;
  onShowReviews: () => void;
  onEdit: () => void;
}

// Coluna principal da visão geral, na ordem que o jogador escolheu em Editar perfil
export const ProfileOverview: React.FC<ProfileOverviewProps> = ({ profile, sections, reviews, lists, gamesById, year, onSelectGame, onOpenList, onShowReviews, onEdit }) => {
  const { custom, steam } = profile;
  const artworkUrl = custom.artworkUrl || steam?.showcaseArt?.imageUrl;
  const artworkCaption = custom.artworkCaption || (custom.artworkUrl ? undefined : steam?.showcaseArt?.title);
  const highlights = profile.featuredGames.length > 0 ? profile.featuredGames : profile.favorites.length > 0 ? profile.favorites : profile.mostPlayed;
  const highlightsTitle = profile.featuredGames.length > 0 ? SECTION_LABEL.featured : profile.favorites.length > 0 ? 'Favoritos' : 'Mais jogados';
  const featuredLists = lists.filter((l) => l.featured);
  const shownLists = (featuredLists.length > 0 ? featuredLists : lists).slice(0, OVERVIEW_LISTS);
  const showcase = profile.featuredAchievements.length > 0 ? profile.featuredAchievements : profile.rarestAchievements.map((a) => ({ ...a, key: `${a.gameId}-${a.name}` }));

  const render = (id: ProfileSectionId): React.ReactNode => {
    switch (id) {
      case 'artwork':
        return artworkUrl ? (
          <figure key={id} className="group">
            <img src={artworkUrl} alt={artworkCaption ?? ''} className="max-w-full max-h-[460px] object-contain rounded-xl shadow-2xl shadow-black/40" />
            {artworkCaption && <figcaption className="mt-2 text-sm text-slate-200 drop-shadow">{artworkCaption}</figcaption>}
          </figure>
        ) : null;

      case 'featured':
        return highlights.length > 0 ? (
          <Panel key={id} title={highlightsTitle} extra={profile.featuredGames.length === 0 ? <LinkButton onClick={onEdit}>Escolher os meus</LinkButton> : undefined}>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${FEATURED_SIZE}, minmax(0, 1fr))` }}>
              {highlights.slice(0, FEATURED_SIZE).map((game) => (
                <CoverCard key={game.id} title={game.title} coverUrl={game.coverUrl} gameId={game.id} onOpen={() => onSelectGame(game.id)} meta={<span>{formatHours(game.playtimeSeconds)}</span>} />
              ))}
            </div>
          </Panel>
        ) : null;

      case 'reviews':
        return (
          <Panel key={id} title={SECTION_LABEL.reviews} extra={reviews.length > OVERVIEW_REVIEWS ? <LinkButton onClick={onShowReviews}>Ver todas ({reviews.length})</LinkButton> : undefined}>
            {reviews.length === 0 ? (
              <div className="flex items-center gap-4 py-2">
                <span className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-300">
                  <NotebookPen className="w-5 h-5" />
                </span>
                <p className="text-sm text-slate-400">Nenhuma resenha ainda. Abra um jogo e escreva em “Meu registro”: ela aparece aqui.</p>
              </div>
            ) : (
              reviews.slice(0, OVERVIEW_REVIEWS).map((game) => <ReviewCard key={game.id} game={game} onOpen={() => onSelectGame(game.id)} />)
            )}
          </Panel>
        );

      case 'lists':
        return (
          <Panel key={id} title={SECTION_LABEL.lists} extra={lists.length > 0 ? <LinkButton onClick={() => onOpenList()}>Ver todas</LinkButton> : undefined}>
            {shownLists.length === 0 ? (
              <div className="flex items-center justify-between gap-4 py-1">
                <p className="text-sm text-slate-400">Crie listas como “Melhores de {year}” e destaque aqui as suas preferidas.</p>
                <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => onOpenList()} className="flex-shrink-0">
                  Criar lista
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {shownLists.map((list) => (
                  <ListCard key={list.id} list={list} games={gamesById} onOpen={() => onOpenList(list.id)} />
                ))}
              </div>
            )}
          </Panel>
        );

      case 'achievements':
        return showcase.length > 0 ? (
          <Panel key={id} title={SECTION_LABEL.achievements} extra={profile.featuredAchievements.length === 0 ? 'as mais raras que você tem' : undefined}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {showcase.map((a) => (
                <AchievementTile key={a.key} name={a.name} gameTitle={a.gameTitle} iconUrl={a.iconUrl} globalPercent={a.globalPercent} onOpen={() => onSelectGame(a.gameId)} />
              ))}
            </div>
          </Panel>
        ) : null;

      case 'activity': {
        const rows = profile.recentGames.slice(0, ACTIVITY_ROWS);
        return (
          <Panel key={id} title={SECTION_LABEL.activity} extra={profile.recentPlaytimeSeconds ? `${formatHours(profile.recentPlaytimeSeconds)} nas últimas 2 semanas` : undefined}>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum jogo nas últimas 2 semanas.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((g) => (
                  <ActivityRow key={g.id} game={g} onOpen={() => onSelectGame(g.id)} />
                ))}
              </div>
            )}
          </Panel>
        );
      }

      case 'screenshots':
        return profile.screenshots.length > 0 ? (
          <Panel key={id} title={SECTION_LABEL.screenshots}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {profile.screenshots.map((shot) => (
                <button
                  type="button"
                  key={shot.url}
                  onClick={() => onSelectGame(shot.gameId)}
                  title={shot.gameTitle}
                  className={`group aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-800 hover:border-slate-500 ${focusRing}`}
                >
                  <img src={shot.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </button>
              ))}
            </div>
          </Panel>
        ) : null;

      case 'mostPlayed':
        return profile.mostPlayed.length > 0 ? (
          <Panel key={id} title={SECTION_LABEL.mostPlayed}>
            <div className="space-y-2">
              {profile.mostPlayed.map((g) => (
                <ActivityRow key={g.id} game={g} onOpen={() => onSelectGame(g.id)} />
              ))}
            </div>
          </Panel>
        ) : null;

      default:
        return null;
    }
  };

  return <div className="space-y-6 min-w-0">{sections.map(render)}</div>;
};
