import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Camera, ImageOff, ImagePlus, Keyboard, Loader2, Trash2 } from 'lucide-react';
import type { GameLog, ReviewImage } from '@shared/types/game';
import type { ReviewImageSource } from '@shared/types/ipc';
import type { Screenshot } from '@shared/types/screenshots';
import { MAX_REVIEW_IMAGES, ReviewBlock, blockKey, fromBlocks, mergeTextBlocks, toBlocks } from '@shared/utils/review-blocks';
import { useKeyboardStore } from '../stores/useKeyboardStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { prepareReviewImage, reviewImageSrc } from '../utils/reviewImage';
import { Button, EmptyState, Modal, focusRing, inputClass, labelClass } from './ui';

const MAX_DROP_BYTES = 40 * 1024 * 1024;
const PARAGRAPH_BREAK = /\n\s*\n/;

interface ReviewEditorProps {
  gameId: string;
  review?: string;
  images?: ReviewImage[];
  hasGamepad: boolean;
  onChange: (changes: Pick<GameLog, 'review' | 'reviewImages'>) => void;
  onBlur: () => void;
  onError: (message: string | null) => void;
}

// Caixa de texto que cresce com o que se escreve (cada trecho entre imagens é uma)
const GrowingTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows: number }>(
  ({ minRows, value, className, ...rest }, ref) => {
    const inner = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);
    return (
      <textarea
        {...rest}
        ref={(el) => {
          inner.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        value={value}
        rows={minRows}
        className={`${className} resize-none overflow-hidden`}
      />
    );
  }
);
GrowingTextarea.displayName = 'GrowingTextarea';

// Resenha como num blog: texto, imagem, texto... A imagem entra onde o cursor estava (ou no fim).
export const ReviewEditor: React.FC<ReviewEditorProps> = ({ gameId, review, images, hasGamepad, onChange, onBlur, onError }) => {
  const [blocks, setBlocks] = useState<ReviewBlock[]>(() => toBlocks(review, images));
  const blocksRef = useRef(blocks);
  const textRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const lastFocus = useRef<{ key: string; caret: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const imageCount = blocks.filter((b) => b.kind === 'image').length;
  const full = imageCount >= MAX_REVIEW_IMAGES;

  const commit = (next: ReviewBlock[]) => {
    blocksRef.current = next;
    setBlocks(next);
    onChange(fromBlocks(next));
  };

  const setText = (key: string, text: string) => commit(blocksRef.current.map((b) => (b.key === key && b.kind === 'text' ? { ...b, text } : b)));

  const rememberCaret = (key: string, el: HTMLTextAreaElement) => {
    lastFocus.current = { key, caret: el.selectionStart ?? el.value.length };
  };

  const insertImage = (image: ReviewImage) => {
    const current = blocksRef.current;
    const focus = lastFocus.current;
    const index = focus ? current.findIndex((b) => b.key === focus.key && b.kind === 'text') : -1;
    const after: ReviewBlock = { kind: 'text', key: blockKey(), text: '' };
    const imageBlock: ReviewBlock = { kind: 'image', key: blockKey(), image };
    let next: ReviewBlock[];
    if (index >= 0) {
      const block = current[index] as Extract<ReviewBlock, { kind: 'text' }>;
      const caret = Math.max(0, Math.min(block.text.length, focus!.caret));
      after.text = block.text.slice(caret).replace(/^\s+/, '');
      next = [...current.slice(0, index), { ...block, text: block.text.slice(0, caret).replace(/\s+$/, '') }, imageBlock, after, ...current.slice(index + 1)];
    } else {
      next = [...current, imageBlock, after];
    }
    // A próxima imagem entra logo depois desta
    lastFocus.current = { key: after.key, caret: 0 };
    commit(next);
  };

  const addFromSource = async (load: () => Promise<ReviewImageSource | null>) => {
    if (busy || blocksRef.current.filter((b) => b.kind === 'image').length >= MAX_REVIEW_IMAGES) return;
    setBusy(true);
    onError(null);
    try {
      const source = await load();
      if (!source) return;
      const prepared = await prepareReviewImage(source);
      const saved = await window.electronAPI.saveReviewImage(prepared.bytes);
      insertImage({ id: saved.id, at: 0, width: prepared.width, height: prepared.height });
    } catch (err) {
      onError(`Não deu para pôr a imagem: ${ipcErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const file = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (!file) return false;
    void addFromSource(async () => {
      if (file.size > MAX_DROP_BYTES) throw new Error('Imagem grande demais (até 40 MB).');
      return { fileName: file.name || 'imagem', mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
    });
    return true;
  };

  const removeImage = (key: string) => {
    commit(mergeTextBlocks(blocksRef.current.filter((b) => b.key !== key)));
  };

  // Subir/descer passa a imagem por um parágrafo (ou troca de lugar com a imagem vizinha)
  const neighbor = (index: number, direction: -1 | 1) => {
    const text = blocksRef.current[index + direction];
    const other = blocksRef.current[index + 2 * direction];
    return { text: text?.kind === 'text' ? text : null, image: other?.kind === 'image' ? other : null };
  };
  const canMove = (index: number, direction: -1 | 1) => {
    const { text, image } = neighbor(index, direction);
    return !!text?.text.trim() || !!image;
  };
  const moveImage = (index: number, direction: -1 | 1) => {
    const current = [...blocksRef.current];
    const { text, image } = neighbor(index, direction);
    if (!text) return;
    if (text.text.trim()) {
      const paragraphs = text.text.split(PARAGRAPH_BREAK);
      const moved = direction === -1 ? paragraphs.pop()! : paragraphs.shift()!;
      const otherIndex = index - direction;
      const otherText = current[otherIndex] as Extract<ReviewBlock, { kind: 'text' }>;
      current[index + direction] = { ...text, text: paragraphs.join('\n\n') };
      current[otherIndex] = {
        ...otherText,
        text: (direction === -1 ? [moved.trim(), otherText.text.trim()] : [otherText.text.trim(), moved.trim()]).filter(Boolean).join('\n\n')
      };
    } else if (image) {
      const imageIndex = index + 2 * direction;
      [current[index], current[imageIndex]] = [current[imageIndex], current[index]];
    }
    commit(current);
  };

  const openKeyboard = () => {
    const key = lastFocus.current?.key;
    const el = (key && textRefs.current.get(key)) || [...textRefs.current.values()].pop();
    if (el) useKeyboardStore.getState().openFor(el, 'Minha resenha');
  };

  const textArea = `${inputClass} leading-relaxed select-text`;
  const onlyText = blocks.length === 1;

  return (
    <div>
      <span className={`${labelClass} flex items-center justify-between gap-2`}>
        <span>Minha resenha</span>
        {hasGamepad && (
          <button
            type="button"
            tabIndex={-1}
            onClick={openKeyboard}
            className="inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0 text-[11px] font-normal normal-case tracking-normal text-indigo-300 hover:text-indigo-200"
          >
            <Keyboard className="w-3 h-3" /> Teclado
          </button>
        )}
      </span>

      <div
        className="space-y-2"
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length && addFiles(e.dataTransfer.files)) e.preventDefault();
        }}
      >
        {blocks.map((block, index) =>
          block.kind === 'text' ? (
            <GrowingTextarea
              key={block.key}
              ref={(el) => {
                if (el) textRefs.current.set(block.key, el);
                else textRefs.current.delete(block.key);
              }}
              aria-label={onlyText ? 'Minha resenha' : `Minha resenha, trecho ${blocks.slice(0, index + 1).filter((b) => b.kind === 'text').length}`}
              value={block.text}
              minRows={onlyText ? 8 : index === 0 || index === blocks.length - 1 ? 3 : 1}
              placeholder={
                onlyText
                  ? 'O que achou do jogo? História, gameplay, o que ficou na memória... Dá para pôr imagens no meio, como num blog.'
                  : index === blocks.length - 1
                    ? 'Continue escrevendo...'
                    : index === 0
                      ? 'Comece a resenha aqui (opcional)...'
                      : 'Texto entre as imagens (opcional)...'
              }
              onChange={(e) => {
                setText(block.key, e.target.value);
                rememberCaret(block.key, e.target);
              }}
              onSelect={(e) => rememberCaret(block.key, e.currentTarget)}
              onFocus={(e) => rememberCaret(block.key, e.currentTarget)}
              onKeyUp={(e) => rememberCaret(block.key, e.currentTarget)}
              onMouseUp={(e) => rememberCaret(block.key, e.currentTarget)}
              onPaste={(e) => {
                rememberCaret(block.key, e.currentTarget);
                if (e.clipboardData.files.length && addFiles(e.clipboardData.files)) e.preventDefault();
              }}
              onBlur={(e) => {
                // Clicar em "Captura de tela" ou "Imagem do PC" tira o foco daqui: a imagem entra onde o cursor estava
                rememberCaret(block.key, e.currentTarget);
                onBlur();
              }}
              className={textArea}
            />
          ) : (
            <ReviewImageBlock
              key={block.key}
              image={block.image}
              canUp={canMove(index, -1)}
              canDown={canMove(index, 1)}
              onUp={() => moveImage(index, -1)}
              onDown={() => moveImage(index, 1)}
              onRemove={() => removeImage(block.key)}
            />
          )
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<Camera className="w-3.5 h-3.5" />} disabled={busy || full} onClick={() => setPicking(true)}>
          Captura de tela
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<ImagePlus className="w-3.5 h-3.5" />}
          disabled={busy || full}
          onClick={() => void addFromSource(() => window.electronAPI.pickReviewImageFile())}
        >
          Imagem do PC
        </Button>
        <span className="text-[11px] text-slate-500" aria-live="polite">
          {busy ? (
            <span className="inline-flex items-center gap-1 text-slate-300">
              <Loader2 className="w-3 h-3 animate-spin" /> Preparando a imagem...
            </span>
          ) : full ? (
            `Até ${MAX_REVIEW_IMAGES} imagens por resenha.`
          ) : (
            'Entra onde o cursor estava. Também dá para colar (Ctrl+V) ou arrastar.'
          )}
        </span>
      </div>

      {picking && (
        <ScreenshotPicker
          gameId={gameId}
          onClose={() => setPicking(false)}
          onPick={(shot) => {
            setPicking(false);
            void addFromSource(() => window.electronAPI.readReviewImageScreenshot(gameId, shot.id));
          }}
        />
      )}
    </div>
  );
};

const ReviewImageBlock: React.FC<{
  image: ReviewImage;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}> = ({ image, canUp, canDown, onUp, onDown, onRemove }) => {
  const [broken, setBroken] = useState(false);
  const control = `p-1.5 rounded-md bg-slate-950/80 text-slate-200 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none ${focusRing}`;
  return (
    <figure className="group relative rounded-lg overflow-hidden bg-slate-950/50 border border-slate-800">
      {broken ? (
        <div className="flex items-center justify-center gap-2 h-28 text-xs text-slate-400">
          <ImageOff className="w-4 h-4" /> Imagem não encontrada neste PC
        </div>
      ) : (
        <img
          src={reviewImageSrc(image.id)}
          alt=""
          width={image.width}
          height={image.height}
          draggable={false}
          onError={() => setBroken(true)}
          className="block mx-auto w-auto h-auto max-w-full max-h-[420px] object-contain"
        />
      )}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button type="button" className={control} disabled={!canUp} onClick={onUp} aria-label="Subir a imagem" title="Subir">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={control} disabled={!canDown} onClick={onDown} aria-label="Descer a imagem" title="Descer">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={`${control} hover:text-red-300`} onClick={onRemove} aria-label="Tirar a imagem da resenha" title="Tirar da resenha">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </figure>
  );
};

// Capturas de tela deste jogo (Steam, Xbox Game Bar e as do Lazulium)
const ScreenshotPicker: React.FC<{ gameId: string; onClose: () => void; onPick: (shot: Screenshot) => void }> = ({ gameId, onClose, onPick }) => {
  const [shots, setShots] = useState<Screenshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.electronAPI
      .listScreenshots(gameId)
      .then((list) => alive && setShots(list))
      .catch((err) => alive && setError(ipcErrorMessage(err)));
    return () => {
      alive = false;
    };
  }, [gameId]);

  return (
    <Modal title="Escolher captura de tela" subtitle="A imagem entra na resenha onde o cursor estava." icon={<Camera className="w-4 h-4 text-indigo-400" />} onClose={onClose} size="2xl" tall>
      {error ? (
        <p className="text-sm text-red-300">Não deu para abrir as capturas: {error}</p>
      ) : !shots ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Procurando capturas...
        </div>
      ) : shots.length === 0 ? (
        <EmptyState compact icon={Camera} title="Este jogo ainda não tem capturas" description='Use "Imagem do PC" para escolher qualquer imagem.' />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {shots.map((shot) => (
            <button
              key={shot.id}
              type="button"
              onClick={() => onPick(shot)}
              className={`relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 hover:border-indigo-400 transition-colors ${focusRing}`}
              title={shot.fileName}
            >
              <img src={shot.thumbUrl || shot.url} alt={shot.fileName} loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
};
