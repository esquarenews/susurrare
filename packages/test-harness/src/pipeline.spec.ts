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

  it('applies formatting commands when enabled', () => {
    const output = runPipeline(
      'make next word bold hello',
      {
        ...context,
        mode: {
          id: 'mode-format',
          name: 'Format',
          model: { selection: 'fast' },
          streamingEnabled: true,
          punctuationNormalization: true,
          formattingEnabled: true,
          formattingStyle: 'markdown',
          insertionBehavior: 'insert',
          vocabularySetIds: ['global'],
          createdAt: 0,
          updatedAt: 0,
        },
      },
      DEFAULT_PIPELINE
    );
    expect(output).toBe('**hello**');
  });

  it('formats the next sentence when requested', () => {
    const output = runPipeline(
      'Make the next sentence bold. Hello, world.',
      {
        ...context,
        mode: {
          id: 'mode-format',
          name: 'Format',
          model: { selection: 'fast' },
          streamingEnabled: true,
          punctuationNormalization: true,
          punctuationCommandsEnabled: false,
          formattingEnabled: true,
          formattingStyle: 'markdown',
          insertionBehavior: 'insert',
          vocabularySetIds: ['global'],
          createdAt: 0,
          updatedAt: 0,
        },
      },
      DEFAULT_PIPELINE
    );
    expect(output).toBe('**Hello**, **world**.');
  });

  it('supports punctuation-only commands', () => {
    const output = runPipeline(
      'hello comma world full stop',
      {
        ...context,
        mode: {
          id: 'mode-punct',
          name: 'Punct',
          model: { selection: 'fast' },
          streamingEnabled: true,
          punctuationNormalization: true,
          punctuationCommandsEnabled: true,
          formattingEnabled: false,
          formattingStyle: 'plain',
          insertionBehavior: 'insert',
          vocabularySetIds: ['global'],
          createdAt: 0,
          updatedAt: 0,
        },
      },
      DEFAULT_PIPELINE
    );
    expect(output).toBe('hello, world.');
  });
});
