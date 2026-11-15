import { describe, expect, it } from 'vitest';
import { applyKeyboardAction, getKeyboardRows } from '../../src/renderer/src/utils/onScreenKeyboard';

describe('on-screen keyboard helpers', () => {
  it('insere letras, acentos, espaço e maiúsculas na posição do cursor', () => {
    let state = applyKeyboardAction('Hads', 3, 3, { type: 'char', char: 'e' });
    expect(state).toEqual({ nextValue: 'Hades', nextCursor: 4 });

    state = applyKeyboardAction(state.nextValue, 5, 5, { type: 'space' });
    expect(state).toEqual({ nextValue: 'Hades ', nextCursor: 6 });

    state = applyKeyboardAction('ação', 0, 4, { type: 'char', char: 'Ótima' });
    expect(state).toEqual({ nextValue: 'Ótima', nextCursor: 5 });

    const upper = getKeyboardRows('letters', true);
    expect(upper[1]?.[0]).toBe('Q');
    const accents = getKeyboardRows('symbols', false);
    expect(accents[0]).toContain('ã');
  });

  it('apaga caractere ou seleção e respeita multiline apenas em textarea', () => {
    expect(applyKeyboardAction('Celeste', 7, 7, { type: 'backspace' })).toEqual({
      nextValue: 'Celest',
      nextCursor: 6
    });
    expect(applyKeyboardAction('Celeste', 0, 3, { type: 'backspace' })).toEqual({
      nextValue: 'este',
      nextCursor: 0
    });
    expect(applyKeyboardAction('Busca', 5, 5, { type: 'newline' }, { multiline: false })).toEqual({
      nextValue: 'Busca',
      nextCursor: 5
    });
    expect(applyKeyboardAction('Linha 1', 7, 7, { type: 'newline' }, { multiline: true })).toEqual({
      nextValue: 'Linha 1\n',
      nextCursor: 8
    });
    expect(applyKeyboardAction('Algo', 2, 2, { type: 'clear' })).toEqual({
      nextValue: '',
      nextCursor: 0
    });
  });
});
