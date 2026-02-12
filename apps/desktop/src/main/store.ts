import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  HistoryItemSchema,
  ModeSchema,
  SCHEMA_VERSION,
  SettingsSchema,
  VocabularyEntrySchema,
  type HistoryItem,
  type Mode,
  type Settings,
  type VocabularyEntry,
  ShortcutEntrySchema,
  type ShortcutEntry,
} from '@susurrare/core';

export interface PersistedState {
  history: HistoryItem[];
  modes: Mode[];
  vocabulary: VocabularyEntry[];
  shortcuts: ShortcutEntry[];
  settings: Settings;
}

const defaultMode = (): Mode =>
  ModeSchema.parse({
    id: 'default',
    name: 'Default',
    punctuationCommandsEnabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

const defaultState = (): PersistedState => {
  const settings = SettingsSchema.parse({ activeModeId: 'default' });
  return {
    history: [],
    modes: [defaultMode()],
    vocabulary: [],
    shortcuts: [],
    settings,
  };
};

const stateFilePath = () => join(app.getPath('userData'), 'susurrare-state.json');

export const loadState = (): PersistedState => {
  const filePath = stateFilePath();
  if (!existsSync(filePath)) return defaultState();
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      version?: number;
      payload?: Partial<PersistedState>;
    };
    const payload = raw.payload ?? {};
    const history = (Array.isArray(payload.history) ? payload.history : []).map((item) =>
      HistoryItemSchema.parse(item)
    );
    const vocabulary = (Array.isArray(payload.vocabulary) ? payload.vocabulary : []).map((entry) =>
      VocabularyEntrySchema.parse(entry)
    );
    const shortcuts = (Array.isArray(payload.shortcuts) ? payload.shortcuts : []).map((entry) =>
      ShortcutEntrySchema.parse(entry)
    );
    let modes = (Array.isArray(payload.modes) ? payload.modes : []).map((mode) => {
      const needsPunctuation =
        mode?.id === 'default' && typeof (mode as { punctuationCommandsEnabled?: boolean })
          .punctuationCommandsEnabled === 'undefined';
      if (needsPunctuation) {
        return ModeSchema.parse({ ...mode, punctuationCommandsEnabled: true });
      }
      return ModeSchema.parse(mode);
    });
    if (!modes.find((mode) => mode.id === 'default')) {
      modes = [defaultMode(), ...modes];
    }
    let settings = SettingsSchema.parse(payload.settings ?? {});
    if (!modes.find((mode) => mode.id === settings.activeModeId)) {
      settings = SettingsSchema.parse({ ...settings, activeModeId: 'default' });
    }
    return { history, vocabulary, shortcuts, modes, settings };
  } catch (error) {
    // Keep startup resilient if state is corrupted or manually edited into an invalid shape.
    console.error('Failed to load persisted state, using defaults.', error);
    return defaultState();
  }
};

export const saveState = (state: PersistedState) => {
  const filePath = stateFilePath();
  const envelope = {
    version: SCHEMA_VERSION,
    payload: state,
  };
  writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf-8');
};
