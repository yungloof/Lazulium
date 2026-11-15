export type KeyboardLayer = 'letters' | 'symbols';

export type KeyboardAction =
  | { type: 'char'; char: string }
  | { type: 'backspace' }
  | { type: 'space' }
  | { type: 'newline' }
  | { type: 'clear' };

export const LETTER_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?']
];

export const SYMBOL_ROWS: readonly (readonly string[])[] = [
  ['á', 'é', 'í', 'ó', 'ú', 'ã', 'õ', 'â', 'ê', 'ô'],
  ['à', 'ü', 'ñ', 'ç', 'ª', 'º', '-', '_', '/', ':'],
  ['"', "'", '(', ')', '!', ';', '+', '=', '@', '#'],
  ['$', '%', '&', '*', '[', ']', '{', '}', '<', '>']
];

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'hidden',
  'image',
  'month',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'week'
]);

/** Checks whether an element is an active, editable text input or textarea. */
export function isEditableTextElement(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    if (el.disabled || el.readOnly) return false;
    return !NON_TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase());
  }
  return false;
}

/** Returns key rows with uppercase mapping applied when Shift is enabled. */
export function getKeyboardRows(layer: KeyboardLayer, shift: boolean): string[][] {
  const base = layer === 'letters' ? LETTER_ROWS : SYMBOL_ROWS;
  return base.map((row) => row.map((key) => (shift ? key.toLocaleUpperCase('pt-BR') : key)));
}

/** Applies a virtual keyboard edit to a string + selection range cleanly. */
export function applyKeyboardAction(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: KeyboardAction,
  options: { multiline?: boolean } = {}
): { nextValue: string; nextCursor: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const before = value.slice(0, start);
  const after = value.slice(end);

  switch (action.type) {
    case 'char':
      return { nextValue: `${before}${action.char}${after}`, nextCursor: start + action.char.length };
    case 'space':
      return { nextValue: `${before} ${after}`, nextCursor: start + 1 };
    case 'newline':
      if (!options.multiline) return { nextValue: value, nextCursor: end };
      return { nextValue: `${before}\n${after}`, nextCursor: start + 1 };
    case 'backspace': {
      if (start !== end) return { nextValue: `${before}${after}`, nextCursor: start };
      if (start === 0) return { nextValue: value, nextCursor: 0 };
      return { nextValue: `${value.slice(0, start - 1)}${after}`, nextCursor: start - 1 };
    }
    case 'clear':
      return { nextValue: '', nextCursor: 0 };
  }
}

/** Updates a controlled React input/textarea and fires its native input change pipeline. */
export function writeValueToEditableElement(
  el: HTMLInputElement | HTMLTextAreaElement,
  nextValue: string,
  nextCursor: number
): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, nextValue);
  else el.value = nextValue;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    el.setSelectionRange(nextCursor, nextCursor);
  } catch {
    // Alguns tipos como email não aceitam setSelectionRange em todos os navegadores
  }
}
