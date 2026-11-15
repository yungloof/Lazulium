import { create } from 'zustand';
import {
  applyKeyboardAction,
  isEditableTextElement,
  KeyboardAction,
  KeyboardLayer,
  writeValueToEditableElement
} from '../utils/onScreenKeyboard';

interface KeyboardState {
  target: (HTMLInputElement | HTMLTextAreaElement) | null;
  label: string;
  multiline: boolean;
  value: string;
  cursorStart: number;
  cursorEnd: number;
  layer: KeyboardLayer;
  shift: boolean;

  openFor: (el: HTMLInputElement | HTMLTextAreaElement, label?: string) => void;
  dispatchKey: (action: KeyboardAction) => void;
  toggleShift: () => void;
  toggleLayer: () => void;
  close: (options?: { restoreFocus?: boolean }) => void;
}

function fieldLabel(el: HTMLInputElement | HTMLTextAreaElement, fallback?: string): string {
  if (fallback) return fallback;
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  const placeholder = el.getAttribute('placeholder')?.trim();
  if (placeholder) return placeholder;
  return el instanceof HTMLTextAreaElement ? 'Texto' : 'Campo de texto';
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  target: null,
  label: 'Texto',
  multiline: false,
  value: '',
  cursorStart: 0,
  cursorEnd: 0,
  layer: 'letters',
  shift: false,

  openFor: (el, label) => {
    if (!el.isConnected || !isEditableTextElement(el)) return;
    const value = el.value ?? '';
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : value.length;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    set({
      target: el,
      label: fieldLabel(el, label),
      multiline: el instanceof HTMLTextAreaElement,
      value,
      cursorStart: start,
      cursorEnd: end,
      layer: 'letters',
      shift: false
    });
  },

  dispatchKey: (action) => {
    const state = get();
    const { target } = state;
    if (!target || !target.isConnected) {
      set({ target: null });
      return;
    }

    const currentValue = target.value ?? state.value;
    const { nextValue, nextCursor } = applyKeyboardAction(
      currentValue,
      Math.min(state.cursorStart, currentValue.length),
      Math.min(state.cursorEnd, currentValue.length),
      action,
      { multiline: state.multiline }
    );

    writeValueToEditableElement(target, nextValue, nextCursor);
    const shouldDropShift = action.type === 'char' && state.shift;
    set({
      value: nextValue,
      cursorStart: nextCursor,
      cursorEnd: nextCursor,
      shift: shouldDropShift ? false : state.shift
    });
  },

  toggleShift: () => set((s) => ({ shift: !s.shift })),

  toggleLayer: () => set((s) => ({ layer: s.layer === 'letters' ? 'symbols' : 'letters' })),

  close: (options = { restoreFocus: true }) => {
    const { target } = get();
    set({ target: null, shift: false, layer: 'letters' });
    if (options.restoreFocus !== false && target && target.isConnected) {
      requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
        try {
          const len = target.value.length;
          target.setSelectionRange(len, len);
        } catch {
          // Ignora campos que não permitem seleção programática
        }
      });
    }
  }
}));
