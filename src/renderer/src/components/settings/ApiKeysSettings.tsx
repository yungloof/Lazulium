import React, { useEffect, useState } from 'react';
import { ExternalLink, ImageDown } from 'lucide-react';
import { ApiKeyTestResult } from '@shared/types/ipc';
import { ipcErrorMessage } from '../../utils/ipcErrorMessage';
import { Button, Notice, buttonClass, labelClass } from '../ui';
import { SecretInput, SettingsGroup } from './controls';

interface KeyField {
  setting: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

interface KeyService {
  id: string;
  title: string;
  purpose: string;
  link: { url: string; label: string };
  fields: KeyField[];
  test: (values: string[]) => Promise<ApiKeyTestResult> | undefined;
}

// Chaves manuais: só para quem prefere não usar o login das Contas (ou para depurar)
const SERVICES: KeyService[] = [
  {
    id: 'sgdb',
    title: 'SteamGridDB',
    purpose: 'Capas e artes',
    link: { url: 'https://www.steamgriddb.com/profile/preferences/api', label: 'steamgriddb.com → Preferências → API' },
    fields: [{ setting: 'steamGridDbApiKey', label: 'Chave da API', placeholder: 'Cole sua chave do SteamGridDB', secret: true }],
    test: ([key]) => window.electronAPI?.testSteamGridDbKey(key)
  },
  {
    id: 'steam',
    title: 'Steam Web API',
    purpose: 'Conquistas pela API oficial (o login da Steam em Contas já basta)',
    link: { url: 'https://steamcommunity.com/dev/apikey', label: 'steamcommunity.com/dev/apikey' },
    fields: [
      { setting: 'steamWebApiKey', label: 'Web API Key', placeholder: 'Chave de 32 caracteres', secret: true },
      { setting: 'steamUserId', label: 'SteamID64', placeholder: 'Ex.: 76561198000000000' }
    ],
    test: ([key, id]) => window.electronAPI?.testSteamCredentials(key, id)
  },
  {
    id: 'ra',
    title: 'RetroAchievements',
    purpose: 'Conquistas dos emuladores',
    link: { url: 'https://retroachievements.org/controlpanel.php', label: 'retroachievements.org → Minha conta → Chaves' },
    fields: [
      { setting: 'retroAchievementsUser', label: 'Usuário', placeholder: 'Seu usuário no RA' },
      { setting: 'retroAchievementsApiKey', label: 'Web API Key', placeholder: 'Cole sua Web API Key', secret: true }
    ],
    test: ([user, key]) => window.electronAPI?.testRetroAchievementsCredentials(user, key)
  }
];

type Feedback = { tone: 'success' | 'error'; text: string } | null;

const KeyServiceForm: React.FC<{ service: KeyService; settings: Record<string, string> }> = ({ service, settings }) => {
  const initial = service.fields.map((f) => settings[f.setting] ?? '');
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState<'test' | 'save' | 'fetch' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const trimmed = values.map((v) => v.trim());
  const complete = trimmed.every(Boolean);
  const changed = values.some((v, i) => v !== saved[i]);

  const task = async (kind: 'test' | 'save' | 'fetch', work: () => Promise<Feedback>) => {
    setBusy(kind);
    setFeedback(null);
    try {
      setFeedback(await work());
    } catch (err) {
      setFeedback({ tone: 'error', text: ipcErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const test = () =>
    task('test', async () => {
      const result = await service.test(trimmed);
      return result ? { tone: result.ok ? 'success' : 'error', text: result.message } : null;
    });

  // Com tudo preenchido, só salva o que passou no teste
  const save = () =>
    task('save', async () => {
      if (complete) {
        const result = await service.test(trimmed);
        if (!result?.ok) return { tone: 'error', text: result?.message ?? 'Não foi possível validar. Confira e tente de novo.' };
      }
      for (const [i, field] of service.fields.entries()) await window.electronAPI?.setSetting(field.setting, trimmed[i]);
      setValues(trimmed);
      setSaved(trimmed);
      return { tone: 'success', text: complete ? 'Salvo. A chave fica cifrada neste PC.' : trimmed.some(Boolean) ? 'Atualizado.' : 'Removido.' };
    });

  const fetchMissing = () =>
    task('fetch', async () => {
      const queued = (await window.electronAPI?.fetchMissingArtwork()) ?? 0;
      return { tone: 'success', text: queued > 0 ? `Buscando artes para ${queued} jogo(s) em segundo plano.` : 'Todos os jogos já têm capa.' };
    });

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{service.title}</p>
          <p className="text-xs text-slate-500">{service.purpose}</p>
        </div>
        <a href={service.link.url} target="_blank" rel="noreferrer" title={service.link.label} className={`${buttonClass('link')} flex-shrink-0 text-xs`}>
          Onde pegar <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className={`grid gap-3 ${service.fields.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {service.fields.map((field, i) => (
          <label key={field.setting} className="block min-w-0">
            <span className={labelClass}>{field.label}</span>
            <SecretInput
              secret={!!field.secret}
              value={values[i]}
              placeholder={field.placeholder}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                setValues(next);
                setFeedback(null);
              }}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {service.id === 'sgdb' && (
          <Button variant="ghost" icon={<ImageDown className="w-3.5 h-3.5" />} loading={busy === 'fetch'} onClick={fetchMissing} disabled={!saved[0] || busy !== null} className="mr-auto">
            Buscar artes faltantes agora
          </Button>
        )}
        <Button onClick={test} loading={busy === 'test'} disabled={!complete || busy !== null}>
          Testar
        </Button>
        <Button variant="primary" onClick={save} loading={busy === 'save'} disabled={!changed || busy !== null}>
          Salvar
        </Button>
      </div>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </div>
  );
};

export const ApiKeysSettings: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI
      ?.getSettings()
      .then(setSettings)
      .catch((err) => setError(ipcErrorMessage(err)));
  }, []);

  return (
    <SettingsGroup title="Chaves de API manuais" description="O login em Contas já faz isso. Use aqui só se preferir colar suas chaves.">
      {error ? (
        <div className="px-4 py-3">
          <Notice>{error}</Notice>
        </div>
      ) : settings ? (
        SERVICES.map((service) => <KeyServiceForm key={service.id} service={service} settings={settings} />)
      ) : (
        <div className="px-4 py-6 text-xs text-slate-500">Carregando...</div>
      )}
    </SettingsGroup>
  );
};
