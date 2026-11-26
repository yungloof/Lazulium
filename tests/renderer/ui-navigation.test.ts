import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../src/renderer/src/stores/useUiStore';

describe('histórico de navegação em useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({
      view: 'home',
      selectedGameId: null,
      openListId: undefined,
      openFriendId: undefined,
      history: []
    });
  });

  it('empilha telas visitadas e volta na ordem certa com goBack', () => {
    const ui = useUiStore.getState();
    ui.setView('journal');
    ui.openGameId('gta-sa');
    ui.openList('favs');

    expect(useUiStore.getState().view).toBe('lists');
    expect(useUiStore.getState().openListId).toBe('favs');
    expect(useUiStore.getState().history).toHaveLength(3);

    expect(useUiStore.getState().goBack()).toBe(true);
    expect(useUiStore.getState().view).toBe('game');
    expect(useUiStore.getState().selectedGameId).toBe('gta-sa');

    expect(useUiStore.getState().goBack()).toBe(true);
    expect(useUiStore.getState().view).toBe('journal');

    expect(useUiStore.getState().goBack()).toBe(true);
    expect(useUiStore.getState().view).toBe('home');

    expect(useUiStore.getState().goBack()).toBe(false);
  });

  it('não duplica entradas idênticas consecutivas no histórico', () => {
    const ui = useUiStore.getState();
    ui.setView('journal');
    ui.setView('journal');

    expect(useUiStore.getState().history).toHaveLength(1);
  });
});
