import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, X } from 'lucide-react';
import { ProfileWebLink, ProfileWebStatus } from '@shared/types/profile';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface ProfilePublishModalProps {
  status: ProfileWebStatus;
  onClose: () => void;
  onChanged: (status: ProfileWebStatus) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const secondary = `flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`;

export const ProfilePublishModal: React.FC<ProfilePublishModalProps> = ({ status, onClose, onChanged }) => {
  const [repoUrl, setRepoUrl] = useState(status.repoUrl ?? '');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !publishing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, publishing]);

  const open = (link: ProfileWebLink) => void window.electronAPI?.openProfileWebLink(link).catch((err) => setError(ipcErrorMessage(err)));

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const next = await window.electronAPI?.publishProfileWeb(repoUrl);
      if (next) onChanged(next);
      setPublished(true);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setPublishing(false);
    }
  };

  const disconnect = async () => {
    try {
      const next = await window.electronAPI?.disconnectProfileWeb();
      if (next) onChanged(next);
      setRepoUrl('');
      setPublished(false);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => !publishing && onClose()}>
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-lg bg-steam-panel border border-slate-800 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-base text-white">Publicar perfil na web</h2>
          <button onClick={onClose} disabled={publishing} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs leading-relaxed text-amber-200">
            <p className="font-semibold">A página fica pública, e o histórico do repositório também.</p>
            <p className="mt-1">Vai para lá: nome, avatar, bio, nível, horas, jogos, conquistas, fundo e vitrine.</p>
            <p className="mt-1">Fica de fora: nome real, país, resenhas e anotações do Diário, capturas e caminhos do seu PC. Imagens e vídeos escolhidos do seu PC também não vão: a página usa os da Steam ou fica sem eles.</p>
          </div>

          {!status.repoUrl && (
            <ol className="space-y-3 text-xs leading-relaxed list-decimal list-inside">
              <li>
                Crie um repositório público e vazio no GitHub.
                <button onClick={() => open('new-repo')} className={`${secondary} mt-1.5`}>
                  <ExternalLink className="w-3.5 h-3.5" /> Criar no GitHub
                </button>
              </li>
              <li>Cole o endereço dele abaixo e clique em Publicar. Na primeira vez, o Git abre uma janela de login do GitHub.</li>
              <li>Ative o site em Settings → Pages: Branch <code>main</code>, pasta <code>/ (root)</code>. Essa etapa aparece aqui depois de publicar.</li>
            </ol>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="profile-repo">
              Endereço do repositório
            </label>
            <input
              id="profile-repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/seu-usuario/lazulium-perfil"
              className={`w-full px-3 py-2 text-sm bg-slate-900/80 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 ${focusRing}`}
            />
          </div>

          {published && status.pageUrl && (
            <div className="space-y-2 text-xs">
              <p className="text-emerald-300">Perfil enviado. Na primeira publicação, ative o site; depois de ativo, a página pode levar alguns minutos para atualizar.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => open('pages-settings')} className={secondary}>
                  <ExternalLink className="w-3.5 h-3.5" /> Ativar o site (Pages)
                </button>
                <button onClick={() => open('page')} className={secondary}>
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir minha página
                </button>
              </div>
            </div>
          )}

          {status.lastPublishedAt && !published && (
            <p className="text-xs text-slate-400">Última publicação em {new Date(status.lastPublishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</p>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 flex-shrink-0">
          {status.repoUrl ? (
            <button onClick={disconnect} disabled={publishing} className={`text-xs text-slate-400 hover:text-white rounded-lg disabled:opacity-50 ${focusRing}`} title="O app para de publicar. O que já está no GitHub continua lá até você apagar o repositório.">
              Desconectar repositório
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={publishing} className={`px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 ${focusRing}`}>
              Fechar
            </button>
            <button onClick={publish} disabled={publishing || !repoUrl.trim()} className={`flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 ${focusRing}`}>
              {publishing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {publishing ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
