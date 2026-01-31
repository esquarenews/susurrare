import { z } from 'zod';

export const IPC_VERSION = '1.0.0';

export const RecordingCommandSchema = z.enum(['start', 'stop', 'cancel']);
export type RecordingCommand = z.infer<typeof RecordingCommandSchema>;

export const TranscriptionEventSchema = z.object({
  kind: z.enum(['partial', 'final']),
  text: z.string(),
  timestamp: z.number(),
});
export type TranscriptionEvent = z.infer<typeof TranscriptionEventSchema>;

export const HistoryItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.number(),
  modeId: z.string().optional(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const SettingsSchema = z.object({
  activeModeId: z.string().default('default'),
  pushToTalkKey: z.string().default('F15'),
  overlayStyle: z.enum(['classic', 'mini', 'none']).default('classic'),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  speed: z.enum(['fast', 'balanced', 'accurate']),
  description: z.string().optional(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const InsertActionSchema = z.object({
  text: z.string(),
  mode: z.enum(['paste', 'copy']).default('paste'),
});
export type InsertAction = z.infer<typeof InsertActionSchema>;

export const DiagnosticsExportSchema = z.object({
  startedAt: z.number(),
  finishedAt: z.number(),
  filePath: z.string(),
});
export type DiagnosticsExport = z.infer<typeof DiagnosticsExportSchema>;

export const IpcChannels = {
  recordingCommand: 'recording:command',
  transcriptionEvent: 'transcription:event',
  insertAction: 'insert:action',
  historyList: 'history:list',
  historyAdd: 'history:add',
  historyDelete: 'history:delete',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  modelsList: 'models:list',
  diagnosticsExport: 'diagnostics:export',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IpcEnvelopeSchema = z.object({
  version: z.literal(IPC_VERSION),
  payload: z.unknown(),
});
export type IpcEnvelope = z.infer<typeof IpcEnvelopeSchema>;
