import { randomUUID } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { sanitizeCustomEmulator } from '@shared/constants/emulators';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { CustomEmulatorDefinition, EmulatorConfig } from '@shared/types/game';
import { db } from '../database/db';
import { detectEmulators } from '../services/scanners/emulator-detect.service';
import { askOpenPaths, askSavePath, handle } from './helpers';

const PRESETS_FILTER = [{ name: 'Presets do Lazulium', extensions: ['json'] }];
const MAX_IMPORTED_PRESETS = 50;

const presetKey = (definition: CustomEmulatorDefinition) => `${definition.name}|${definition.commandTemplate}`.toLowerCase();

export function registerEmulatorHandlers(): void {
  handle(IPC_CHANNELS.EMULATORS_GET_CONFIGS, () => db.getEmulatorConfigs());
  handle(IPC_CHANNELS.EMULATORS_SAVE_CONFIG, (_event, config: EmulatorConfig) => db.saveEmulatorConfig(config));
  handle(IPC_CHANNELS.EMULATORS_DELETE_CONFIG, (_event, emulatorId: string) => db.deleteEmulatorConfig(emulatorId));

  handle(IPC_CHANNELS.EMULATORS_DETECT, async () => {
    await detectEmulators(true);
    return db.getEmulatorConfigs();
  });

  // Presets compartilháveis: só a receita (nome, sistema, extensões, comando), nunca caminhos deste PC
  handle(IPC_CHANNELS.EMULATORS_EXPORT_PRESETS, async (event) => {
    const presets = db.getEmulatorConfigs().flatMap((c) => (c.custom ? [c.custom] : []));
    if (presets.length === 0) throw new Error('Nenhum emulador personalizado para exportar.');
    const path = await askSavePath(event, { title: 'Salvar presets de emuladores', defaultPath: 'lazulium-emuladores.json', filters: PRESETS_FILTER });
    if (!path) return null;
    await writeFile(path, JSON.stringify({ lazulium: 'emulators', version: 1, emulators: presets }, null, 2), 'utf-8');
    return path;
  });

  handle(IPC_CHANNELS.EMULATORS_IMPORT_PRESETS, async (event) => {
    const [path] = (await askOpenPaths(event, { title: 'Importar presets de emuladores', properties: ['openFile'], filters: PRESETS_FILTER })) ?? [];
    if (!path) return null;
    let parsed: { emulators?: unknown };
    try {
      parsed = JSON.parse(await readFile(path, 'utf-8'));
    } catch {
      throw new Error('Não consegui ler esse arquivo de presets.');
    }
    const list: unknown[] = Array.isArray(parsed?.emulators) ? parsed.emulators : [];
    const existing = new Set(db.getEmulatorConfigs().flatMap((c) => (c.custom ? [presetKey(c.custom)] : [])));
    let added = 0;
    let valid = 0;
    for (const item of list.slice(0, MAX_IMPORTED_PRESETS)) {
      const definition = sanitizeCustomEmulator(item);
      if (!definition) continue;
      valid++;
      if (existing.has(presetKey(definition))) continue;
      existing.add(presetKey(definition));
      db.saveEmulatorConfig({ emulatorId: `custom-${randomUUID()}`, enabled: false, romDirectories: [], custom: definition });
      added++;
    }
    if (list.length > 0 && valid === 0) throw new Error('O arquivo não tem nenhum emulador válido.');
    return { added, configs: db.getEmulatorConfigs() };
  });
}
