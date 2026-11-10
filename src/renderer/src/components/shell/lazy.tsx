import React, { lazy, useState } from 'react';

// Páginas e janelas pesadas em arquivos próprios: a biblioteca abre sem esperar o Perfil, o Diário
// ou as Configurações. Depois que a biblioteca aparece, o resto é baixado em segundo plano (prefetchAll);
// o que já chegou abre direto, sem passar pelo esqueleto.

type Loaded<P> = React.ComponentType<P>;

// Tipo nomeável (o build com declarações não consegue copiar as props não exportadas de cada página)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LazyComponent<C extends React.JSXElementConstructor<any>> = React.FC<React.ComponentProps<C>> & { preload: () => Promise<unknown> };

function lazyNamed<P extends object>(load: () => Promise<Loaded<P>>) {
  let loaded: Loaded<P> | null = null;
  let pending: Promise<Loaded<P>> | null = null;
  const preload = (): Promise<Loaded<P>> =>
    (pending ??= load()
      .then((component) => (loaded = component))
      .catch((err) => {
        pending = null; // Tenta de novo na próxima vez
        throw err;
      }));
  const Lazy = lazy(() => preload().then((component) => ({ default: component })));
  const Component: React.FC<P> = (props) => {
    // Decide uma vez por montagem: trocar de Lazy para o direto no meio remontaria a página
    const [Direct] = useState(() => loaded);
    return Direct ? <Direct {...props} /> : <Lazy {...(props as React.ComponentProps<typeof Lazy>)} />;
  };
  return Object.assign(Component, { preload });
}

export const GamePage: LazyComponent<typeof import('../GamePage')['GamePage']> = lazyNamed(() => import('../GamePage').then((m) => m.GamePage));
export const ProfilePage: LazyComponent<typeof import('../ProfilePage')['ProfilePage']> = lazyNamed(() => import('../ProfilePage').then((m) => m.ProfilePage));
export const JournalPage: LazyComponent<typeof import('../JournalPage')['JournalPage']> = lazyNamed(() => import('../JournalPage').then((m) => m.JournalPage));
export const ListsPage: LazyComponent<typeof import('../ListsPage')['ListsPage']> = lazyNamed(() => import('../ListsPage').then((m) => m.ListsPage));
export const WishlistPage: LazyComponent<typeof import('../WishlistPage')['WishlistPage']> = lazyNamed(() => import('../WishlistPage').then((m) => m.WishlistPage));
export const GalleryPage: LazyComponent<typeof import('../GalleryPage')['GalleryPage']> = lazyNamed(() => import('../GalleryPage').then((m) => m.GalleryPage));

export const SettingsModal: LazyComponent<typeof import('../SettingsModal')['SettingsModal']> = lazyNamed(() => import('../SettingsModal').then((m) => m.SettingsModal));
export const EmulatorSettings: LazyComponent<typeof import('../EmulatorSettings')['EmulatorSettings']> = lazyNamed(() => import('../EmulatorSettings').then((m) => m.EmulatorSettings));
export const WelcomeModal: LazyComponent<typeof import('../WelcomeModal')['WelcomeModal']> = lazyNamed(() => import('../WelcomeModal').then((m) => m.WelcomeModal));
export const AddCustomGameModal: LazyComponent<typeof import('../AddCustomGameModal')['AddCustomGameModal']> = lazyNamed(() => import('../AddCustomGameModal').then((m) => m.AddCustomGameModal));
export const ArtworkPicker: LazyComponent<typeof import('../ArtworkPicker')['ArtworkPicker']> = lazyNamed(() => import('../ArtworkPicker').then((m) => m.ArtworkPicker));
export const AchievementsPanel: LazyComponent<typeof import('../AchievementsPanel')['AchievementsPanel']> = lazyNamed(() => import('../AchievementsPanel').then((m) => m.AchievementsPanel));
export const SaveBackupPanel: LazyComponent<typeof import('../SaveBackupPanel')['SaveBackupPanel']> = lazyNamed(() => import('../SaveBackupPanel').then((m) => m.SaveBackupPanel));
export const ScreenshotsPanel: LazyComponent<typeof import('../ScreenshotsPanel')['ScreenshotsPanel']> = lazyNamed(() => import('../ScreenshotsPanel').then((m) => m.ScreenshotsPanel));
export const PlaytimeEditor: LazyComponent<typeof import('../PlaytimeEditor')['PlaytimeEditor']> = lazyNamed(() => import('../PlaytimeEditor').then((m) => m.PlaytimeEditor));
export const AddToListModal: LazyComponent<typeof import('../AddToListModal')['AddToListModal']> = lazyNamed(() => import('../AddToListModal').then((m) => m.AddToListModal));
export const RenameGameModal: LazyComponent<typeof import('../RenameGameModal')['RenameGameModal']> = lazyNamed(() => import('../RenameGameModal').then((m) => m.RenameGameModal));
export const LaunchOptionsModal: LazyComponent<typeof import('../LaunchOptionsModal')['LaunchOptionsModal']> = lazyNamed(() => import('../LaunchOptionsModal').then((m) => m.LaunchOptionsModal));

// Ordem do download em segundo plano: o que se abre mais vem antes
const PREFETCH_ORDER = [
  GamePage,
  JournalPage,
  ProfilePage,
  ListsPage,
  GalleryPage,
  WishlistPage,
  AchievementsPanel,
  ScreenshotsPanel,
  ArtworkPicker,
  SaveBackupPanel,
  SettingsModal,
  WelcomeModal,
  EmulatorSettings,
  AddCustomGameModal,
  PlaytimeEditor,
  AddToListModal,
  RenameGameModal,
  LaunchOptionsModal
];

let prefetched = false;

export function prefetchAll(): void {
  if (prefetched) return;
  prefetched = true;
  const queue = [...PREFETCH_ORDER];
  const idle = (cb: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 1200 }) : window.setTimeout(cb, 200));
  const next = () => {
    const item = queue.shift();
    if (!item) return;
    item
      .preload()
      .catch(() => undefined)
      .finally(() => idle(next));
  };
  idle(next);
}
