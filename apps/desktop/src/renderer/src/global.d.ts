import type {
  DiagnosticsExport,
  HistoryItem,
  ModelInfo,
  Settings,
  TranscriptionEvent,
  Mode,
  VocabularyEntry,
  StatsSummaryRequest,
  StatsSummaryResponse,
  ShortcutEntry,
} from '@susurrare/core';

declare global {
  interface Window {
    susurrare: {
      recording: {
        start: () => Promise<unknown>;
        stop: () => Promise<unknown>;
        cancel: () => Promise<unknown>;
      };
      insert: (payload: { text: string; mode?: 'paste' | 'copy' }) => Promise<unknown>;
      history: {
        list: () => Promise<HistoryItem[]>;
        add: (item: HistoryItem) => Promise<unknown>;
        remove: (id: string) => Promise<unknown>;
        pin: (id: string, pinned: boolean) => Promise<unknown>;
        exportSelection: (ids: string[]) => Promise<{ filePath: string }>;
        onUpdated: (listener: (items: HistoryItem[]) => void) => () => void;
      };
      settings: {
        get: () => Promise<Settings>;
        set: (partial: Partial<Settings>) => Promise<Settings>;
      };
      help: {
        open: (sectionId?: string) => Promise<{ ok: boolean }>;
      };
      app: {
        info: () => Promise<{ name: string; version: string }>;
      };
      models: {
        list: () => Promise<ModelInfo[]>;
      };
      modes: {
        list: () => Promise<Mode[]>;
        save: (mode: Mode) => Promise<Mode>;
        remove: (id: string) => Promise<unknown>;
      };
      vocabulary: {
        list: () => Promise<VocabularyEntry[]>;
        save: (entry: VocabularyEntry) => Promise<VocabularyEntry>;
        remove: (id: string) => Promise<unknown>;
      };
      shortcuts: {
        list: () => Promise<ShortcutEntry[]>;
        save: (entry: ShortcutEntry) => Promise<ShortcutEntry>;
        remove: (id: string) => Promise<unknown>;
      };
      updates: {
        check: () => Promise<{ status: string; info?: unknown; message?: string }>;
      };
      diagnostics: {
        export: () => Promise<DiagnosticsExport>;
      };
      stats: {
        summary: (payload: StatsSummaryRequest) => Promise<StatsSummaryResponse>;
      };
      onTranscription: (listener: (event: TranscriptionEvent) => void) => () => void;
      onRecordingStatus: (listener: (event: { status: 'idle' | 'recording' | 'processing' | 'error'; timestamp: number; message?: string }) => void) => () => void;
    };
  }
}

export {};
