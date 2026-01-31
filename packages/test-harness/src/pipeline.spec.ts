import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PIPELINE,
  type PipelineContext,
  runPipeline,
  SettingsSchema,
  VocabularyEntrySchema,
} from '@susurrare/core';

describe('pipeline', () => {
  const context: PipelineContext = {
    settings: SettingsSchema.parse({ punctuationNormalization: true }),
    vocabulary: [
      VocabularyEntrySchema.parse({
        id: '1',
        source: 'OpenAI',
        replacement: 'OpenAI Inc.',
        createdAt: 0,
        updatedAt: 0,
      }),
    ],
  };

  it('runs deterministically with defaults', () => {
    const input = '  Hello   OpenAI  ...  ';
    const output = runPipeline(input, context, DEFAULT_PIPELINE);
    expect(output).toBe('Hello OpenAI Inc....');
  });

  it('skips punctuation normalization when disabled', () => {
    const output = runPipeline('Hello   world ...', {
      ...context,
      settings: SettingsSchema.parse({ punctuationNormalization: false }),
    });
    expect(output).toBe('Hello world ...');
  });
});
