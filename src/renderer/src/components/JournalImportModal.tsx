import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, ShieldCheck, X } from 'lucide-react';
import { GameLog } from '@shared/types/game';
import { JournalImportApplyResult, JournalImportAction, JournalImportParse, JournalImportPreviewItem } from '@shared/types/journal-import';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { ImportFileResult, mergeImportParses, readImportFile } from '../utils/importers';
import { Button, Modal, Notice, chipClass, focusRing } from './ui';

interface JournalImportModalProps {
  onClose: () => void;
  onImported: (result: JournalImportApplyResult) => void;
}

const FIELD_LABEL: Record<keyof GameLog, string> = {
  status: 'status',
  rating: 'nota',
  startedOn: 'início',
  finishedOn: 'fim',
  review: 'resenha',
  notes: 'anotações'
};

const ACTION_BADGE: Record<JournalImportAction, { label: string; className: string }> = {
  update: { label: 'Atualiza', className: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/30' },
  create: { label: 'Novo no Diário', className: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30' },
  unchanged: { label: 'Já está igual', className: 'bg-slate-800/60 text-slate-400 border-slate-700/70' }
};

const MAX_ROWS = 300;
const fieldList = (fields: Array<keyof GameLog>) => fields.map((f) => FIELD_LABEL[f]).join(', ');

// Traz o Diário de outro lugar: a página salva do Your Gamer Profile ou do Backloggd, ou a cópia do Diário do Lazulium.
// Os arquivos são lidos aqui no computador; nada é enviado para a internet.
export const JournalImportModal: React.FC<JournalImportModalProps> = ({ onClose, onImported }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ImportFileResult[]>([]);
  const [reading, setReading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [preview, setPreview] = useState<JournalImportPreviewItem[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<'ygp' | 'backloggd'>('ygp');

  const merged: JournalImportParse | null = useMemo(() => {
    const parses = files.flatMap((f) => (f.ok ? [f.parse] : []));
    return mergeImportParses(parses);
  }, [files]);

  // A prévia vem do main, que conhece a biblioteca: quem casa com um jogo e quem viraria entrada nova
  useEffect(() => {
    if (!merged) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreview(null);
    window.electronAPI
      ?.previewJournalImport(merged.items, { replaceExisting })
      .then((rows) => !cancelled && setPreview(rows))
      .catch((err) => !cancelled && setError(ipcErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [merged, replaceExisting]);

  const addFiles = async (list: FileList | File[]) => {
    const chosen = Array.from(list);
    if (chosen.length === 0) return;
    setReading(true);
    setError(null);
    try {
      const read: ImportFileResult[] = [];
      for (const file of chosen) read.push(await readImportFile(file));
      setFiles((prev) => [...prev.filter((p) => !read.some((r) => r.name === p.name)), ...read]);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setReading(false);
    }
  };

  const counts = useMemo(() => {
    const c = { update: 0, create: 0, unchanged: 0 };
    for (const row of preview ?? []) c[row.action] += 1;
    return c;
  }, [preview]);

  const toImport = counts.update + counts.create;
  const keptTotal = (preview ?? []).reduce((sum, row) => sum + row.kept.length, 0);

  const handleImport = async () => {
    if (!merged || applying || toImport === 0) return;
    setApplying(true);
    setError(null);
    try {
      const result = await window.electronAPI?.applyJournalImport(merged.items, { replaceExisting });
      if (result) onImported(result);
      onClose();
    } catch (err) {
      setError(ipcErrorMessage(err));
      setApplying(false);
    }
  };

  const rows = (preview ?? []).filter((r) => r.action !== 'unchanged').concat((preview ?? []).filter((r) => r.action === 'unchanged'));

  return (
    <Modal
      title="Importar para o Diário"
      subtitle="Traga seus registros do Your Gamer Profile, do Backloggd ou de uma cópia do Lazulium."
      icon={<FileDown className="w-4 h-4 text-indigo-400" />}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Notice className="mr-auto">{error}</Notice>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="md" loading={applying} disabled={toImport === 0 || !preview} onClick={() => void handleImport()}>
            {toImport > 0 ? `Importar ${toImport} ${toImport === 1 ? 'jogo' : 'jogos'}` : 'Importar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1.5" role="group" aria-label="De onde vêm os arquivos">
          {([
            ['ygp', 'Your Gamer Profile'],
            ['backloggd', 'Backloggd']
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={site === id}
              onClick={() => setSite(id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${focusRing} ${
                site === id ? 'bg-indigo-500/20 border-indigo-400/40 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {site === 'ygp' ? (
          <ol className="space-y-1.5 text-[13px] text-slate-300 list-decimal pl-5 marker:text-slate-500">
            <li>
              No Your Gamer Profile, abra seu perfil na aba <strong className="text-white">Avaliações</strong> (traz o texto das resenhas) e/ou na aba <strong className="text-white">Jogos</strong> (traz todos, até os sem
              texto).
            </li>
            <li>Role até o fim para carregar tudo e clique em “Ler mais” nas resenhas compridas.</li>
            <li>
              A aba Jogos só guarda no arquivo as linhas que estão na tela: diminua o zoom (<kbd className="px-1 rounded bg-slate-800 text-slate-200">Ctrl</kbd> + <kbd className="px-1 rounded bg-slate-800 text-slate-200">-</kbd>) e salve
              de novo em outros trechos da lista. Os arquivos se somam e o mesmo jogo não duplica.
            </li>
            <li>
              Salve com <kbd className="px-1 rounded bg-slate-800 text-slate-200">Ctrl</kbd> + <kbd className="px-1 rounded bg-slate-800 text-slate-200">S</kbd> (“Página da Web, completa”) e escolha o arquivo <code className="text-slate-200">.htm</code> aqui.
              Uma cópia do Diário do Lazulium (<code className="text-slate-200">.json</code>) também serve.
            </li>
          </ol>
        ) : (
          <ol className="space-y-1.5 text-[13px] text-slate-300 list-decimal pl-5 marker:text-slate-500">
            <li>
              No Backloggd, abra seu perfil na página <strong className="text-white">Games</strong> (traz todos os jogos com nota e status) e/ou na página <strong className="text-white">Reviews</strong> (traz o texto das resenhas e a plataforma).
            </li>
            <li>Se a lista tiver mais de uma página, salve cada uma. Os arquivos se somam e o mesmo jogo não duplica.</li>
            <li>
              Salve com <kbd className="px-1 rounded bg-slate-800 text-slate-200">Ctrl</kbd> + <kbd className="px-1 rounded bg-slate-800 text-slate-200">S</kbd> (“Página da Web, completa”) e escolha os arquivos <code className="text-slate-200">.htm</code> aqui.
            </li>
            <li className="text-slate-400">O Backloggd não guarda horas jogadas nem datas de início e término, então só vêm nota, status, resenha e plataforma.</li>
          </ol>
        )}

        <p className="flex items-start gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
          Os arquivos são lidos neste computador e não vão para a internet. O Lazulium não acessa o site do YGP nem o do Backloggd.
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
          className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-4 flex flex-wrap items-center gap-3"
        >
          <Button icon={<FileUp className="w-3.5 h-3.5" />} loading={reading} onClick={() => inputRef.current?.click()}>
            Escolher arquivos
          </Button>
          <span className="text-xs text-slate-500">ou solte aqui · .htm, .html ou .json</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".htm,.html,.json,text/html,application/json"
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files ?? []);
              e.target.value = '';
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.name} className="flex items-center gap-2 text-xs">
                <span className={`truncate ${f.ok ? 'text-slate-300' : 'text-red-300'}`} title={f.name}>
                  {f.name}
                </span>
                <span className="text-slate-500 flex-shrink-0">{f.ok ? `${f.parse.items.length} ${f.parse.items.length === 1 ? 'jogo' : 'jogos'}` : f.error}</span>
                <button
                  type="button"
                  aria-label={`Tirar ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((p) => p.name !== f.name))}
                  className={`ml-auto p-0.5 rounded text-slate-500 hover:text-white ${focusRing}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {merged && (
          <div className="space-y-3">
            <p className="text-sm text-slate-200">
              {merged.items.length} {merged.items.length === 1 ? 'jogo encontrado' : 'jogos encontrados'}
              {merged.expectedGames ? <span className="text-slate-400"> · o perfil mostra {merged.expectedGames}</span> : null}
            </p>

            {merged.expectedGames && merged.items.length < merged.expectedGames && (merged.source === 'ygp' || merged.source === 'backloggd') && (
              <Notice tone="info">
                {merged.source === 'backloggd'
                  ? `Faltam ${merged.expectedGames - merged.items.length} jogos que o Backloggd lista no perfil. Salve as outras páginas da lista Games e escolha os arquivos aqui: eles se somam.`
                  : `Faltam ${merged.expectedGames - merged.items.length} jogos que o YGP lista no perfil. Salve a aba Jogos de novo rolando até outros trechos (e a aba Avaliações, para o texto das resenhas) e escolha os arquivos aqui: eles se somam.`}
              </Notice>
            )}
            {merged.truncatedReviews > 0 && (
              <Notice tone="info">
                {merged.truncatedReviews} {merged.truncatedReviews === 1 ? 'resenha estava recolhida' : 'resenhas estavam recolhidas'} (“Ler mais”) e pode ter vindo cortada. Abra-as no YGP e salve a página de novo.
              </Notice>
            )}

            {preview && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={chipClass}>{counts.update} para atualizar</span>
                  <span className={chipClass}>{counts.create} novos no Diário</span>
                  <span className={chipClass}>{counts.unchanged} já iguais</span>
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} className={`mt-0.5 accent-indigo-500 ${focusRing}`} />
                  <span>
                    Substituir o que já está preenchido no Diário
                    <span className="block text-slate-500">
                      Desmarcado, o arquivo só completa o que está vazio{keptTotal > 0 ? ` (${keptTotal} ${keptTotal === 1 ? 'campo seu foi mantido' : 'campos seus foram mantidos'})` : ''}.
                    </span>
                  </span>
                </label>

                <ul className="max-h-64 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800/80">
                  {rows.slice(0, MAX_ROWS).map((row) => {
                    const badge = ACTION_BADGE[row.action];
                    return (
                      <li key={row.key} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-200" title={row.matchedTitle && row.matchedTitle !== row.title ? `${row.title} → ${row.matchedTitle}` : row.title}>
                          {row.title}
                        </span>
                        <span className="flex-shrink-0 text-slate-500 truncate max-w-[45%]">
                          {row.changes.length > 0 && fieldList(row.changes)}
                          {row.kept.length > 0 && <span className="text-amber-300/80">{row.changes.length > 0 ? ' · ' : ''}mantido: {fieldList(row.kept)}</span>}
                        </span>
                      </li>
                    );
                  })}
                  {rows.length > MAX_ROWS && <li className="px-3 py-1.5 text-xs text-slate-500">e mais {rows.length - MAX_ROWS} jogos</li>}
                </ul>
              </>
            )}
            {!preview && !error && <p className="text-xs text-slate-500">Conferindo com a sua biblioteca…</p>}
          </div>
        )}
      </div>
    </Modal>
  );
};
