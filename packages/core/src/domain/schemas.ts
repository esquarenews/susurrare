import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const ModeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  model: z
    .object({
      selection: z.enum(['fast', 'accurate', 'meeting', 'pinned']),
      pinnedModelId: z.string().optional(),
    })
    .default({ selection: 'fast' }),
  streamingEnabled: z.boolean().default(true),
  punctuationNormalization: z.boolean().optional(),
  punctuationCommandsEnabled: z.boolean().default(false),
  formattingEnabled: z.boolean().default(false),
  formattingStyle: z.enum(['plain', 'markdown', 'slack']).default('plain'),
  rewritePrompt: z.string().optional(),
  insertionBehavior: z.enum(['insert', 'clipboard']).default('insert'),
  vocabularySetIds: z.array(z.string()).default(['global', 'mode']),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Mode = z.infer<typeof ModeSchema>;

export const HistoryItemSchema = z.object({
  id: z.string(),
  text: z.string().default(''),
  createdAt: z.number(),
  pinned: z.boolean().default(false),
  modeId: z.string().optional(),
  modelId: z.string().optional(),
  rawText: z.string().optional(),
  processedText: z.string().optional(),
  wordCount: z.number().int().optional(),
  latencyMs: z.number().int().optional(),
  audioDurationMs: z.number().int().optional(),
  insertion: z
    .object({
      outcome: z.enum(['inserted', 'clipboard', 'failed']),
      method: z.enum(['accessibility', 'clipboard']).optional(),
    })
    .optional(),
  appName: z.string().optional(),
  status: z.enum(['success', 'failed', 'cancelled']).default('success'),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  processingSteps: z.array(z.string()).optional(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const VocabularyEntrySchema = z.object({
  id: z.string(),
  source: z.string(),
  replacement: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  modeId: z.string().optional(),
});
export type VocabularyEntry = z.infer<typeof VocabularyEntrySchema>;

export const SettingsSchema = z.object({
  activeModeId: z.string().default('default'),
  pushToTalkKey: z.string().default('F15'),
  toggleRecordingKey: z.string().default('F14'),
  cancelKey: z.string().default('Escape'),
  changeModeShortcut: z.string().default('Shift+Cmd+K'),
  overlayStyle: z.preprocess(
    (value) => {
      if (value === 'classic' || value === 'mini') return 'show';
      if (value === 'none') return 'hide';
      return value;
    },
    z.enum(['show', 'hide']).default('show')
  ),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  transcriptionLanguage: z.string().default('en'),
  punctuationNormalization: z.boolean().default(true),
  restoreClipboardAfterPaste: z.boolean().default(false),
  recordingTimeoutMs: z.number().int().min(0).default(60000),
  launchOnLogin: z.boolean().default(true),
  updateChecks: z.boolean().default(true),
  silenceRemoval: z.boolean().default(false),
  autoGain: z.boolean().default(false),
  soundEffects: z.boolean().default(true),
  soundEffectsVolume: z.number().min(0).max(100).default(65),
  openAiApiKey: z.string().optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const TelemetryEventSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  modelId: z.string(),
  latencyMs: z.number(),
  audioDurationMs: z.number(),
  success: z.boolean(),
  errorCode: z.string().optional(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const DomainEnvelopeSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  payload: z.unknown(),
});
export type DomainEnvelope = z.infer<typeof DomainEnvelopeSchema>;
