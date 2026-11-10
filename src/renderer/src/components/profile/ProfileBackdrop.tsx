import React, { useEffect, useRef, useState } from 'react';

// Fundo do perfil inteiro, parado enquanto a página rola: claro no alto (vitrine do banner) e escuro embaixo, onde ficam os textos.
// O vídeo pausa sem foco e com jogo aberto: nunca disputa CPU e GPU com o jogo.
export const ProfileBackdrop: React.FC<{ imageUrl?: string; videoUrl?: string; gameRunning: boolean }> = ({ imageUrl, videoUrl, gameRunning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [focused, setFocused] = useState(() => document.hasFocus() && !document.hidden);
  const [failedVideo, setFailedVideo] = useState<string>();
  const [loadedImage, setLoadedImage] = useState<string>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const showVideo = !!videoUrl && failedVideo !== videoUrl && !reducedMotion;
  const hasArt = !!imageUrl || showVideo;

  useEffect(() => {
    const update = () => setFocused(document.hasFocus() && !document.hidden);
    const onFocus = () => setFocused(!document.hidden);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (focused && !gameRunning) void video.play().catch(() => undefined);
    else video.pause();
  }, [focused, gameRunning, showVideo, videoUrl]);

  return (
    <div className="sticky top-0 h-0 z-0" aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-screen overflow-hidden bg-steam-bg">
        {hasArt ? (
          <>
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                onLoad={() => setLoadedImage(imageUrl)}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loadedImage === imageUrl ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
            {showVideo && (
              <video ref={videoRef} key={videoUrl} src={videoUrl} poster={imageUrl} muted loop playsInline preload="auto" onError={() => setFailedVideo(videoUrl)} className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-steam-bg/5 via-steam-bg/45 to-steam-bg/90" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--color-steam-bg)_120%)] opacity-70" />
          </>
        ) : (
          // Sem fundo escolhido: um brilho do destaque do tema, para o topo não ficar vazio
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,var(--color-indigo-900),transparent_70%)] opacity-80" />
        )}
      </div>
    </div>
  );
};
