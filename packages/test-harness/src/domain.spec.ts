import { describe, expect, it } from 'vitest';
import {
  DomainEnvelopeSchema,
  HistoryItemSchema,
  ModeSchema,
  SCHEMA_VERSION,
  SettingsSchema,
  TelemetryEventSchema,
  VocabularyEntrySchema,
} from '@susurrare/core';

describe('domain schemas', () => {
  it('wraps versioned envelope', () => {
    const envelope = DomainEnvelopeSchema.parse({ version: SCHEMA_VERSION, payload: {} });
    expect(envelope.version).toBe(SCHEMA_VERSION);
  });

  it('parses settings defaults', () => {
    const settings = SettingsSchema.parse({});
    expect(settings.pushToTalkKey).toBe('F15');
    expect(settings.cancelKey).toBe('Escape');
    expect(settings.launchOnLogin).toBe(true);
  });

  it('parses core entities', () => {
    expect(
      ModeSchema.parse({
        id: 'mode-1',
        name: 'Default',
        createdAt: 0,
        updatedAt: 0,
      }).name
    ).toBe('Default');

    expect(
      HistoryItemSchema.parse({
        id: 'hist-1',
        text: 'Hello',
        createdAt: 0,
      }).text
    ).toBe('Hello');

    expect(
      VocabularyEntrySchema.parse({
        id: 'vocab-1',
        source: 'AI',
        replacement: 'A.I.',
        createdAt: 0,
        updatedAt: 0,
      }).replacement
    ).toBe('A.I.');

    expect(
      TelemetryEventSchema.parse({
        id: 't-1',
        timestamp: 0,
        modelId: 'gpt',
        latencyMs: 10,
        audioDurationMs: 1000,
        success: true,
      }).success
    ).toBe(true);
  });
});
