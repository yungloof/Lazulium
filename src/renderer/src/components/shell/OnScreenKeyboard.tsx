import React, { useEffect, useMemo } from 'react';
import { Check, CornerDownLeft, Delete, Eraser, Keyboard, Space, X } from 'lucide-react';
import { useGamepadStore } from '../../stores/useGamepadStore';
import { useKeyboardStore } from '../../stores/useKeyboardStore';
import { useUiStore } from '../../stores/useUiStore';
import { navAudio } from '../../utils/navigationAudio';
import { getKeyboardRows } from '../../utils/onScreenKeyboard';
import { detectGamepadFamily, getGamepadBindings } from '../../utils/gamepadGlyphs';
import { focusStart, isNavActive } from '../../utils/spatialNav';
import { focusRing } from '../ui';

const keyBtnBase = `h-10 rounded-lg border text-sm font-medium transition-colors motion-reduce:transition-none active:scale-[0.97] ${focusRing}`;

/** Unified-layout on-screen keyboard for controller search, journal reviews and text inputs. */
export const OnScreenKeyboard: React.FC = () => {
  const target = useKeyboardStore((s) => s.target);
  const label = useKeyboardStore((s) => s.label);
  const multiline = useKeyboardStore((s) => s.multiline);
  const value = useKeyboardStore((s) => s.value);
  const cursorStart = useKeyboardStore((s) => s.cursorStart);
  const cursorEnd = useKeyboardStore((s) => s.cursorEnd);
  const layer = useKeyboardStore((s) => s.layer);
  const shift = useKeyboardStore((s) => s.shift);
  const dispatchKey = useKeyboardStore((s) => s.dispatchKey);
  const toggleShift = useKeyboardStore((s) => s.toggleShift);
  const toggleLayer = useKeyboardStore((s) => s.toggleLayer);
  const close = useKeyboardStore((s) => s.close);

  const view = useUiStore((s) => s.view);
  const modal = useUiStore((s) => s.modal);
  const quickSearchOpen = useUiStore((s) => s.quickSearchOpen);
  const gamepad = useGamepadStore((s) => s.gamepad);

  const rows = useMemo(() => getKeyboardRows(layer, shift), [layer, shift]);
  const family = detectGamepadFamily(gamepad?.id);
  const { face } = getGamepadBindings(family);
  const labels = {
    confirm: face.find((b) => b.id === 'confirm')?.keyLabel ?? 'A',
    back: face.find((b) => b.id === 'back')?.keyLabel ?? 'B',
    backspace: face.find((b) => b.id === 'favorite')?.keyLabel ?? 'X',
    space: face.find((b) => b.id === 'search')?.keyLabel ?? 'Y',
    shift: family === 'playstation' ? 'L1' : family === 'switch' ? 'L' : 'LB',
    layer: family === 'playstation' ? 'R1' : family === 'switch' ? 'R' : 'RB'
  };

  useEffect(() => {
    if (!target) return;
    if (!target.isConnected) {
      close({ restoreFocus: false });
      return;
    }
  }, [target, view, modal, quickSearchOpen, close]);

  useEffect(() => {
    if (!target) return;
    if (isNavActive()) {
      const frame = requestAnimationFrame(() => focusStart());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        navAudio.playBack();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [target, close]);

  if (!target) return null;

  const beforeCursor = value.slice(0, cursorStart);
  const afterCursor = value.slice(cursorEnd);
  const selectedText = cursorEnd > cursorStart ? value.slice(cursorStart, cursorEnd) : '';

  return (
    <section
      data-nav-scope="on-screen-keyboard"
      role="region"
      aria-label="Teclado na tela"
      className="fixed bottom-11 left-1/2 -translate-x-1/2 z-[70] w-[min(95vw,760px)] rounded-xl bg-slate-900/95 border border-slate-700/90 shadow-2xl shadow-black/80 backdrop-blur-md p-3.5 space-y-2.5 animate-pop-in motion-reduce:animate-none select-none"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 text-xs text-slate-200">
          <Keyboard className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span className="font-medium truncate">{label}</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">
            {layer === 'letters' ? 'Letras' : 'Acentos e símbolos'}
          </span>
          {shift && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/40 text-[10px] text-indigo-200 font-semibold">
              Maiúsculas
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => close()}
          aria-label="Fechar teclado na tela"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${focusRing}`}
        >
          <X className="w-3.5 h-3.5" />
          <span>Fechar</span>
        </button>
      </div>

      <div
        aria-live="off"
        className={`w-full rounded-lg bg-slate-950/90 border border-slate-800 px-3 py-2 text-sm text-slate-100 whitespace-pre-wrap break-words ${
          multiline ? 'min-h-[3.25rem] max-h-20 overflow-y-auto' : 'truncate'
        }`}
      >
        {value.length === 0 ? (
          <span className="text-slate-500">
            <span className="inline-block w-0.5 h-4 align-middle bg-indigo-400 mr-0.5" aria-hidden />
            Digite usando o controle...
          </span>
        ) : (
          <>
            <span>{beforeCursor}</span>
            {selectedText ? (
              <mark className="bg-indigo-500/35 text-white rounded-xs">{selectedText}</mark>
            ) : (
              <span className="inline-block w-0.5 h-4 align-middle bg-indigo-400 mx-px" aria-hidden />
            )}
            <span>{afterCursor}</span>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-10 gap-1.5">
            {row.map((keyChar, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                data-nav-start={rowIndex === 1 && colIndex === 0 ? '' : undefined}
                onClick={() => {
                  navAudio.playSelect();
                  dispatchKey({ type: 'char', char: keyChar });
                }}
                className={`${keyBtnBase} bg-slate-800/90 border-slate-700/80 text-slate-100 hover:bg-slate-700 hover:border-slate-500`}
              >
                {keyChar}
              </button>
            ))}
          </div>
        ))}

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => {
              navAudio.playTab();
              toggleShift();
            }}
            aria-pressed={shift}
            className={`${keyBtnBase} px-3 ${
              shift
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-slate-800/90 border-slate-700/80 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Maiús
          </button>

          <button
            type="button"
            onClick={() => {
              navAudio.playTab();
              toggleLayer();
            }}
            aria-pressed={layer === 'symbols'}
            className={`${keyBtnBase} px-3 ${
              layer === 'symbols'
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-slate-800/90 border-slate-700/80 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {layer === 'letters' ? 'áç!@#' : 'ABC'}
          </button>

          <button
            type="button"
            onClick={() => {
              navAudio.playSelect();
              dispatchKey({ type: 'space' });
            }}
            className={`${keyBtnBase} flex-1 flex items-center justify-center gap-1.5 bg-slate-800/90 border-slate-700/80 text-slate-100 hover:bg-slate-700`}
          >
            <Space className="w-3.5 h-3.5 text-slate-400" />
            <span>Espaço</span>
          </button>

          {multiline && (
            <button
              type="button"
              onClick={() => {
                navAudio.playSelect();
                dispatchKey({ type: 'newline' });
              }}
              className={`${keyBtnBase} px-3 flex items-center gap-1 bg-slate-800/90 border-slate-700/80 text-slate-200 hover:bg-slate-700`}
            >
              <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />
              <span>Linha</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              navAudio.playBack();
              dispatchKey({ type: 'backspace' });
            }}
            className={`${keyBtnBase} px-3 flex items-center gap-1 bg-slate-800/90 border-slate-700/80 text-slate-200 hover:bg-slate-700`}
          >
            <Delete className="w-3.5 h-3.5 text-slate-400" />
            <span>Apagar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              navAudio.playBack();
              dispatchKey({ type: 'clear' });
            }}
            title="Limpar texto"
            className={`${keyBtnBase} px-3 flex items-center gap-1 bg-slate-800/90 border-slate-700/80 text-slate-300 hover:bg-slate-700`}
          >
            <Eraser className="w-3.5 h-3.5 text-slate-400" />
            <span>Limpar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              navAudio.playSelect();
              close();
            }}
            className={`${keyBtnBase} px-4 flex items-center gap-1.5 bg-indigo-600 border-indigo-400/60 text-white hover:bg-indigo-500`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Concluir</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-slate-800 text-[11px] text-slate-400">
        <span><strong className="text-slate-200 font-medium">{labels.confirm}</strong> Tecla</span>
        <span><strong className="text-slate-200 font-medium">{labels.backspace}</strong> Apagar</span>
        <span><strong className="text-slate-200 font-medium">{labels.space}</strong> Espaço</span>
        <span><strong className="text-slate-200 font-medium">{labels.shift}</strong> Maiús</span>
        <span><strong className="text-slate-200 font-medium">{labels.layer}</strong> Acentos</span>
        <span><strong className="text-slate-200 font-medium">{labels.back}</strong> Concluir</span>
      </div>
    </section>
  );
};
