import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { Game } from '@shared/types/game';
import { drawShareCard, loadCardImage } from '../utils/shareCard';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Notice, focusRing } from './ui';

interface ShareCardModalProps {
  game: Game;
  onClose: () => void;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({ game, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [coverImg, setCoverImg] = useState<HTMLImageElement | null>(null);
  const [includeReview, setIncludeReview] = useState(!!game.log?.review?.trim());
  const [includePlaytime, setIncludePlaytime] = useState((game.totalPlaytimeSeconds ?? 0) >= 60);
  const [playerName, setPlayerName] = useState<string | undefined>();
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const hasReview = !!game.log?.review?.trim();
  const hasPlaytime = (game.totalPlaytimeSeconds ?? 0) >= 60;
  const editionKey = (game.editions ?? []).map((e) => e.id).join('|');

  useEffect(() => {
    let alive = true;
    setCoverImg(null);
    const coverIds = [game.id, ...(game.editions?.map((e) => e.id).filter((id) => id !== game.id) ?? [])];
    const directFallback = game.media?.coverUrl ?? game.media?.publicCoverUrl ?? game.media?.heroUrl;

    const loadCover = async () => {
      try {
        const dataUrl = await window.electronAPI?.getShareCardCover?.(coverIds);
        if (dataUrl) {
          const loaded = await loadCardImage(dataUrl);
          if (alive && loaded) {
            setCoverImg(loaded);
            return;
          }
        }
      } catch {
        // Cai para o carregamento direto se a leitura pelo processo principal falhar
      }
      const fallback = await loadCardImage(directFallback);
      if (alive) setCoverImg(fallback);
    };

    void loadCover();
    window.electronAPI
      ?.getPlayerProfile()
      .then((p) => {
        if (alive && p?.displayName) setPlayerName(p.displayName);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [game.id, game.media?.coverUrl, game.media?.publicCoverUrl, game.media?.heroUrl, editionKey]);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawShareCard(canvasRef.current, game, { includeReview, includePlaytime, playerName }, coverImg);
  }, [game, includeReview, includePlaytime, playerName, coverImg]);

  const redraw = () => {
    if (!canvasRef.current) return;
    drawShareCard(canvasRef.current, game, { includeReview, includePlaytime, playerName }, coverImg);
  };

  const handleCopy = async () => {
    if (!canvasRef.current || copying) return;
    setCopying(true);
    setFeedback(null);
    try {
      redraw();
      const blob = await new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, 'image/png'));
      if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('Seu sistema não liberou a cópia direta de imagens.');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setFeedback({ tone: 'success', text: 'Imagem copiada. Cole com Ctrl+V no Discord ou onde quiser.' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setFeedback({ tone: 'error', text: `${ipcErrorMessage(err)} Use Salvar PNG como alternativa.` });
    } finally {
      setCopying(false);
    }
  };

  const handleSave = async () => {
    if (!canvasRef.current || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      redraw();
      const dataUrl = canvasRef.current.toDataURL('image/png');
      if (window.electronAPI?.saveShareCardImage) {
        const saved = await window.electronAPI.saveShareCardImage(dataUrl, game.title);
        if (saved) setFeedback({ tone: 'success', text: `Imagem salva em ${saved}` });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `lazulium-${game.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        link.click();
      }
    } catch (err) {
      setFeedback({ tone: 'error', text: ipcErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Cartão para compartilhar"
      subtitle={game.title}
      icon={<Share2 className="w-4 h-4 text-indigo-300" />}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="md" icon={<Download className="w-4 h-4" />} loading={saving} onClick={() => void handleSave()}>
            Salvar PNG
          </Button>
          <Button
            variant="primary"
            size="md"
            data-nav-start
            icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            loading={copying}
            onClick={() => void handleCopy()}
          >
            {copied ? 'Copiado' : 'Copiar imagem'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <canvas ref={canvasRef} className="w-full aspect-[1200/630] rounded-lg border border-slate-800/80 shadow-lg bg-surface-bg" />

        {(hasReview || hasPlaytime) && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
            {hasReview && (
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeReview}
                  onChange={(e) => setIncludeReview(e.target.checked)}
                  className={`w-3.5 h-3.5 accent-indigo-500 rounded-sm ${focusRing}`}
                />
                Mostrar trecho da resenha
              </label>
            )}
            {hasPlaytime && (
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includePlaytime}
                  onChange={(e) => setIncludePlaytime(e.target.checked)}
                  className={`w-3.5 h-3.5 accent-indigo-500 rounded-sm ${focusRing}`}
                />
                Mostrar horas jogadas
              </label>
            )}
          </div>
        )}

        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      </div>
    </Modal>
  );
};
