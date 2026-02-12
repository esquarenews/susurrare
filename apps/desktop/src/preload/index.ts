import { contextBridge, ipcRenderer } from 'electron';
import {
  DiagnosticsExportSchema,
  HistoryItemSchema,
  IPC_VERSION,
  IpcChannels,
  InsertActionSchema,
  HistoryPinSchema,
  HistoryExportSchema,
  ModelInfoSchema,
  StatsSummaryRequestSchema,
  StatsSummaryResponseSchema,
  type IpcEnvelope,
  ModeSchema,
  RecordingCommandSchema,
  RecordingStatusSchema,
  AppInfoSchema,
  type Settings,
  SettingsSchema,
  TranscriptionEventSchema,
  VocabularyEntrySchema,
  ShortcutEntrySchema,
} from '@susurrare/core';

const wrapEnvelope = (payload: unknown) => ({
  version: IPC_VERSION,
  payload,
});

const assertEnvelopeVersion: (envelope: unknown) => asserts envelope is IpcEnvelope = (
  envelope
) => {
  if (!envelope || (envelope as IpcEnvelope).version !== IPC_VERSION) {
    throw new Error('IPC version mismatch');
  }
};

const api = {
  recording: {
    start: async () => {
      return ipcRenderer.invoke(
        IpcChannels.recordingCommand,
        wrapEnvelope(RecordingCommandSchema.parse('start'))
      );
    },
    stop: async () => {
      return ipcRenderer.invoke(
        IpcChannels.recordingCommand,
        wrapEnvelope(RecordingCommandSchema.parse('stop'))
      );
    },
    cancel: async () => {
      return ipcRenderer.invoke(
        IpcChannels.recordingCommand,
        wrapEnvelope(RecordingCommandSchema.parse('cancel'))
      );
    },
  },
  insert: async (payload: { text: string; mode?: 'paste' | 'copy' }) => {
    return ipcRenderer.invoke(
      IpcChannels.insertAction,
      wrapEnvelope(InsertActionSchema.parse(payload))
    );
  },
  history: {
    list: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.historyList);
      assertEnvelopeVersion(envelope);
      return HistoryItemSchema.array().parse(envelope.payload);
    },
    add: async (item: Parameters<typeof HistoryItemSchema.parse>[0]) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.historyAdd,
        wrapEnvelope(HistoryItemSchema.parse(item))
      );
      assertEnvelopeVersion(envelope);
      return envelope.payload;
    },
    remove: async (id: string) => {
      const envelope = await ipcRenderer.invoke(IpcChannels.historyDelete, wrapEnvelope(id));
      assertEnvelopeVersion(envelope);
      return envelope.payload;
    },
    pin: async (id: string, pinned: boolean) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.historyPin,
        wrapEnvelope(HistoryPinSchema.parse({ id, pinned }))
      );
      assertEnvelopeVersion(envelope);
      return envelope.payload;
    },
    exportSelection: async (ids: string[]) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.historyExport,
        wrapEnvelope(HistoryExportSchema.parse({ ids }))
      );
      assertEnvelopeVersion(envelope);
      return envelope.payload as { filePath: string };
    },
    onUpdated: (listener: (items: Array<Parameters<typeof HistoryItemSchema.parse>[0]>) => void) => {
      const handler = (_event: unknown, envelope: unknown) => {
        assertEnvelopeVersion(envelope);
        const parsed = HistoryItemSchema.array().parse(envelope.payload);
        listener(parsed);
      };
      ipcRenderer.on(IpcChannels.historyUpdated, handler);
      return () => ipcRenderer.off(IpcChannels.historyUpdated, handler);
    },
  },
  settings: {
    get: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.settingsGet);
      assertEnvelopeVersion(envelope);
      return SettingsSchema.parse(envelope.payload);
    },
    set: async (partial: Partial<Settings>) => {
      const envelope = await ipcRenderer.invoke(IpcChannels.settingsSet, wrapEnvelope(partial));
      assertEnvelopeVersion(envelope);
      return SettingsSchema.parse(envelope.payload);
    },
  },
  help: {
    open: async (sectionId?: string) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.helpOpen,
        wrapEnvelope({ sectionId })
      );
      assertEnvelopeVersion(envelope);
      return envelope.payload as { ok: boolean };
    },
  },
  app: {
    info: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.appInfo);
      assertEnvelopeVersion(envelope);
      return AppInfoSchema.parse(envelope.payload);
    },
  },
  models: {
    list: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.modelsList);
      assertEnvelopeVersion(envelope);
      return ModelInfoSchema.array().parse(envelope.payload);
    },
  },
  modes: {
    list: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.modesList);
      assertEnvelopeVersion(envelope);
      return ModeSchema.array().parse(envelope.payload);
    },
    save: async (mode: Parameters<typeof ModeSchema.parse>[0]) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.modesSave,
        wrapEnvelope(ModeSchema.parse(mode))
      );
      assertEnvelopeVersion(envelope);
      return ModeSchema.parse(envelope.payload);
    },
    remove: async (id: string) => {
      const envelope = await ipcRenderer.invoke(IpcChannels.modesDelete, wrapEnvelope(id));
      assertEnvelopeVersion(envelope);
      return envelope.payload;
    },
  },
  updates: {
    check: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.updateCheck);
      assertEnvelopeVersion(envelope);
      return envelope.payload as { status: string; info?: unknown; message?: string };
    },
  },
  vocabulary: {
    list: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.vocabularyList);
      assertEnvelopeVersion(envelope);
      return VocabularyEntrySchema.array().parse(envelope.payload);
    },
    save: async (entry: Parameters<typeof VocabularyEntrySchema.parse>[0]) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.vocabularySave,
        wrapEnvelope(VocabularyEntrySchema.parse(entry))
      );
      assertEnvelopeVersion(envelope);
      return VocabularyEntrySchema.parse(envelope.payload);
    },
    remove: async (id: string) => {
      const envelope = await ipcRenderer.invoke(IpcChannels.vocabularyDelete, wrapEnvelope(id));
      assertEnvelopeVersion(envelope);
      return envelope.payload;
    },
  },
  shortcuts: {
    list: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.shortcutsList);
      assertEnvelopeVersion(envelope);
      return ShortcutEntrySchema.array().parse(envelope.payload);
    },
    save: async (entry: Parameters<typeof ShortcutEntrySchema.parse>[0]) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.shortcutsSave,
        wrapEnvelope(ShortcutEntrySchema.parse(entry))
      );
      assertEnvelopeVersion(envelope);
      return ShortcutEntrySchema.parse(envelope.payload);
    },
    remove: async (id: string) => {
      const envelope = await ipcRenderer.invoke(IpcChannels.shortcutsDelete, wrapEnvelope(id));
      assertEnvelopeVersion(envelope);
      return envelope.payload;
    },
  },
  diagnostics: {
    export: async () => {
      const envelope = await ipcRenderer.invoke(IpcChannels.diagnosticsExport);
      assertEnvelopeVersion(envelope);
      return DiagnosticsExportSchema.parse(envelope.payload);
    },
  },
  stats: {
    summary: async (payload: Parameters<typeof StatsSummaryRequestSchema.parse>[0]) => {
      const envelope = await ipcRenderer.invoke(
        IpcChannels.statsSummary,
        wrapEnvelope(StatsSummaryRequestSchema.parse(payload))
      );
      assertEnvelopeVersion(envelope);
      return StatsSummaryResponseSchema.parse(envelope.payload);
    },
  },
  onTranscription: (
    listener: (event: { kind: 'partial' | 'final'; text: string; timestamp: number }) => void
  ) => {
    const handler = (_event: unknown, envelope: unknown) => {
      assertEnvelopeVersion(envelope);
      const parsed = TranscriptionEventSchema.parse(envelope.payload);
      listener(parsed);
    };
    ipcRenderer.on(IpcChannels.transcriptionEvent, handler);
    return () => ipcRenderer.off(IpcChannels.transcriptionEvent, handler);
  },
  onRecordingStatus: (
    listener: (event: { status: 'idle' | 'recording' | 'processing' | 'error'; timestamp: number; message?: string }) => void
  ) => {
    const handler = (_event: unknown, envelope: unknown) => {
      assertEnvelopeVersion(envelope);
      const parsed = RecordingStatusSchema.parse(envelope.payload);
      listener(parsed);
    };
    ipcRenderer.on(IpcChannels.recordingStatus, handler);
    return () => ipcRenderer.off(IpcChannels.recordingStatus, handler);
  },
};

contextBridge.exposeInMainWorld('susurrare', api);
