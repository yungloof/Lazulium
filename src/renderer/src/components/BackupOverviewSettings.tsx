import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { BackupOverview } from '@shared/types/cloudsync';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Select } from './Select';
import { Button, Notice } from './ui';
import { SettingRow, SettingsGroup, SettingsSkeleton, ToggleRow } from './settings/controls';

const LIMITS = ['1', '2', '3', '5', '10', '20'].map((gb) => ({ value: gb, label: `${gb} GB` }));

const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

// O estado de todos os saves num lugar só, e um botão para não depender da passada diária
export const BackupOverviewSettings: React.FC = () => {
  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const [limitGb, setLimitGb] = useState('3');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    window.electronAPI?.getBackupOverview().then(setOverview).catch((err) => setError(ipcErrorMessage(err)));
  }, []);

  useEffect(() => {
    load();
    window.electronAPI
      ?.getSettings()
      .then((s) => setLimitGb(LIMITS.some((l) => l.value === s.backupLimitGb) ? s.backupLimitGb : '3'))
      .catch(() => undefined);
  }, [load]);

  const act = async (work: () => Promise<BackupOverview | undefined>) => {
    setError(null);
    try {
      const next = await work();
      if (next) setOverview(next);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const changeLimit = async (value: string) => {
    setLimitGb(value);
    await act(async () => {
      await window.electronAPI?.setSetting('backupLimitGb', value);
      return window.electronAPI?.getBackupOverview();
    });
  };

  const runNow = async () => {
    setRunning(true);
    await act(async () => window.electronAPI?.runBackupSweep());
    setRunning(false);
  };

  if (!overview) return error ? <Notice>{error}</Notice> : <SettingsSkeleton rows={3} />;

  const lastSweep = overview.lastSweepAt ? new Date(overview.lastSweepAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const tiles = [
    { label: 'jogos protegidos', value: overview.games },
    { label: `backups · ${formatSize(overview.sizeBytes)}`, value: overview.backups },
    { label: 'no Google Drive', value: overview.onDrive }
  ];

  return (
    <div className="space-y-6">
      <SettingsGroup>
        <ToggleRow
          label="Backup automático dos saves"
          hint="Procura as pastas de save dos seus jogos e guarda cópias neste PC ao fechar o jogo e uma vez por dia, só quando algo mudou. Desligado, só valem as pastas que você configurar em cada jogo."
          checked={overview.autoEnabled}
          onChange={(enabled) => void act(async () => window.electronAPI?.setAutoBackup(enabled))}
        />
        <SettingRow label="Espaço máximo neste PC" hint="Passando do limite, as cópias mais antigas saem primeiro; a mais nova de cada jogo sempre fica.">
          <Select value={limitGb} options={LIMITS} onChange={changeLimit} ariaLabel="Espaço máximo dos backups" />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title="Situação"
        actions={
          <Button icon={<RefreshCw className="w-3.5 h-3.5" />} loading={running} onClick={runNow} disabled={running || !overview.autoEnabled}>
            {running ? 'Conferindo...' : 'Conferir agora'}
          </Button>
        }
      >
        <dl className="grid grid-cols-3 divide-x divide-slate-800/90">
          {tiles.map((t) => (
            <div key={t.label} className="px-3 py-4 text-center">
              <dd className="font-display text-2xl text-white tabular-nums">{t.value.toLocaleString('pt-BR')}</dd>
              <dt className="mt-1 text-[11px] text-slate-400">{t.label}</dt>
            </div>
          ))}
        </dl>
        <div className="px-4 py-3 space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-slate-300">
            {overview.pendingUpload > 0 ? (
              <>
                <CloudOff className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                {overview.pendingUpload} ainda só neste PC. {overview.driveConnected ? 'Sobem na próxima passada.' : 'Conecte o Google Drive em Contas para enviar.'}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                {overview.driveConnected ? 'Tudo enviado ao Google Drive.' : 'Tudo guardado neste PC.'}
              </>
            )}
          </p>
          <p className="text-[11px] text-slate-500">
            {!overview.autoEnabled ? 'Automático desligado.' : lastSweep ? `Última conferência: ${lastSweep}.` : 'Primeira conferência em andamento.'} Roda ao fechar o jogo e uma vez por dia.
          </p>
        </div>
      </SettingsGroup>
      <Notice>{error}</Notice>
    </div>
  );
};
