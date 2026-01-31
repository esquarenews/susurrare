import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const ModeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  model: z
    .object({
      selection: z.enum(['fast', 'accurate', 'pinned']),
      pinnedModelId: z.string().optional(),
    })
    .default({ selection: 'fast' }),
  vocabularySetIds: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Mode = z.infer<typeof ModeSchema>;

export const HistoryItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.number(),
  modeId: z.string().optional(),
  modelId: z.string().optional(),
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
  overlayStyle: z.enum(['classic', 'mini', 'none']).default('classic'),
  punctuationNormalization: z.boolean().default(true),
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
