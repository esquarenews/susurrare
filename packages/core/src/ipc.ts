import { z } from 'zod';

export const IPC_VERSION = '1.0.0';

export const RecordingCommandSchema = z.enum(['start', 'stop', 'cancel']);
export type RecordingCommand = z.infer<typeof RecordingCommandSchema>;

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

export const RecordingStatusSchema = z.object({
  status: z.enum(['idle', 'recording', 'processing', 'error']),
  timestamp: z.number(),
  message: z.string().optional(),
});
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

export const HistoryPinSchema = z.object({
  id: z.string(),
  pinned: z.boolean(),
});
export type HistoryPin = z.infer<typeof HistoryPinSchema>;

export const HistoryExportSchema = z.object({
  ids: z.array(z.string()),
});
export type HistoryExport = z.infer<typeof HistoryExportSchema>;

export const StatsSummaryPointSchema = z.object({
  label: z.string(),
  value: z.number(),
});
export type StatsSummaryPoint = z.infer<typeof StatsSummaryPointSchema>;

export const StatsSummarySeriesSchema = z.object({
  id: z.enum(['averageSpeed', 'wordsThisWeek', 'appsUsed', 'savedThisWeek']),
  label: z.string(),
  unit: z.string(),
  points: z.array(StatsSummaryPointSchema),
});
export type StatsSummarySeries = z.infer<typeof StatsSummarySeriesSchema>;

export const StatsSummaryRequestSchema = z.object({
  mode: z.enum(['rolling', 'calendar']),
  series: z.array(StatsSummarySeriesSchema),
});
export type StatsSummaryRequest = z.infer<typeof StatsSummaryRequestSchema>;

export const StatsSummaryResponseSchema = z.object({
  summary: z.string().nullable(),
  source: z.enum(['openai', 'unavailable', 'error']),
});
export type StatsSummaryResponse = z.infer<typeof StatsSummaryResponseSchema>;

export const IpcChannels = {
  recordingCommand: 'recording:command',
  transcriptionEvent: 'transcription:event',
  insertAction: 'insert:action',
  recordingStatus: 'recording:status',
  historyList: 'history:list',
  historyUpdated: 'history:updated',
  historyAdd: 'history:add',
  historyDelete: 'history:delete',
  historyPin: 'history:pin',
  historyExport: 'history:export',
  modesList: 'modes:list',
  modesSave: 'modes:save',
  modesDelete: 'modes:delete',
  vocabularyList: 'vocabulary:list',
  vocabularySave: 'vocabulary:save',
  vocabularyDelete: 'vocabulary:delete',
  updateCheck: 'updates:check',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  helpOpen: 'help:open',
  appInfo: 'app:info',
  modelsList: 'models:list',
  diagnosticsExport: 'diagnostics:export',
  statsSummary: 'stats:summary',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IpcEnvelopeSchema = z.object({
  version: z.literal(IPC_VERSION),
  payload: z.unknown(),
});
export type IpcEnvelope = z.infer<typeof IpcEnvelopeSchema>;
