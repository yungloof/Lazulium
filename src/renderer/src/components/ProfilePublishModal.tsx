import React, { useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { ProfileWebLink, ProfileWebStatus } from '@shared/types/profile';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Notice, buttonClass, inputClass, labelClass } from './ui';

interface ProfilePublishModalProps {
  status: ProfileWebStatus;
  onClose: () => void;
  onChanged: (status: ProfileWebStatus) => void;
}

export const ProfilePublishModal: React.FC<ProfilePublishModalProps> = ({ status, onClose, onChanged }) => {
  const [repoUrl, setRepoUrl] = useState(status.repoUrl ?? '');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const open = (link: ProfileWebLink) => void window.electronAPI?.openProfileWebLink(link).catch((err) => setError(ipcErrorMessage(err)));
  // Enquanto envia, a janela não fecha (o envio continua de qualquer jeito)
  const close = () => !publishing && onClose();

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
    <Modal
      title="Publicar perfil na web"
      icon={<Globe className="w-4 h-4 text-indigo-400" />}
      size="md"
      onClose={close}
      bodyClassName="p-5 space-y-5 text-sm text-slate-300"
      footer={
        <>
          {status.repoUrl && (
            <Button
              variant="ghost"
              onClick={disconnect}
              disabled={publishing}
              title="O app para de publicar. O que já está no GitHub continua lá até você apagar o repositório."
              className="mr-auto"
            >
              Desconectar repositório
            </Button>
          )}
          <Button onClick={close} disabled={publishing}>
            Fechar
          </Button>
          <Button variant="primary" size="md" loading={publishing} onClick={publish} disabled={!repoUrl.trim()}>
            {publishing ? 'Publicando...' : 'Publicar'}
          </Button>
        </>
      }
    >
      <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs leading-relaxed text-amber-200">
        <p className="font-semibold">A página fica pública, e o histórico do repositório também.</p>
        <p className="mt-1">Vai para lá: nome, avatar, bio, nível, horas, jogos, conquistas, fundo e vitrine.</p>
        <p className="mt-1">
          Fica de fora: nome real, país, resenhas e anotações do Diário, capturas e caminhos do seu PC. Imagens e vídeos escolhidos do seu PC também não vão: a página usa os da Steam ou fica sem eles.
        </p>
      </div>

      {!status.repoUrl && (
        <ol className="space-y-3 text-xs leading-relaxed list-decimal list-inside">
          <li>
            Crie um repositório público e vazio no GitHub.
            <Button icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => open('new-repo')} className="ml-2">
              Criar no GitHub
            </Button>
          </li>
          <li>Cole o endereço dele abaixo e clique em Publicar. Na primeira vez, o Git abre uma janela de login do GitHub.</li>
          <li>
            Ative o site em Settings → Pages: Branch <code>main</code>, pasta <code>/ (root)</code>. Essa etapa aparece aqui depois de publicar.
          </li>
        </ol>
      )}

      <label className="block">
        <span className={labelClass}>Endereço do repositório</span>
        <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/seu-usuario/lazulium-perfil" className={inputClass} />
      </label>

      {published && status.pageUrl && (
        <div className="space-y-2 text-xs">
          <Notice tone="success">Perfil enviado. Na primeira publicação, ative o site; depois de ativo, a página pode levar alguns minutos para atualizar.</Notice>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => open('pages-settings')} className={buttonClass()}>
              <ExternalLink className="w-3.5 h-3.5" /> Ativar o site (Pages)
            </button>
            <button type="button" onClick={() => open('page')} className={buttonClass()}>
              <ExternalLink className="w-3.5 h-3.5" /> Abrir minha página
            </button>
          </div>
        </div>
      )}

      {status.lastPublishedAt && !published && (
        <p className="text-xs text-slate-400">Última publicação em {new Date(status.lastPublishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</p>
      )}

      <Notice>{error}</Notice>
    </Modal>
  );
};
