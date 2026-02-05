import type { HistoryItem, Mode, Settings, VocabularyEntry, ShortcutEntry } from '../domain/schemas';

export interface HistoryRepository {
  list(): Promise<HistoryItem[]>;
  add(item: HistoryItem): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ModesRepository {
  list(): Promise<Mode[]>;
  save(mode: Mode): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface VocabularyRepository {
  list(): Promise<VocabularyEntry[]>;
  save(entry: VocabularyEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clearMode(modeId: string): Promise<void>;
}

export interface ShortcutsRepository {
  list(): Promise<ShortcutEntry[]>;
  save(entry: ShortcutEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clearMode(modeId: string): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  set(settings: Settings): Promise<void>;
}
