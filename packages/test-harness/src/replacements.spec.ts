import { describe, expect, it } from 'vitest';
import {
  runPipeline,
  SettingsSchema,
  type ShortcutEntry,
  VocabularyEntrySchema,
} from '@susurrare/core';

const context = {
  settings: SettingsSchema.parse({ punctuationNormalization: false }),
  shortcuts: [] as ShortcutEntry[],
  vocabulary: [
    VocabularyEntrySchema.parse({
      id: '1',
      source: 'cat',
      replacement: 'feline',
      createdAt: 0,
      updatedAt: 0,
    }),
  ],
};

describe('vocabulary replacement engine', () => {
  it('respects word boundaries', () => {
    const output = runPipeline('Concatenate the cat category.', context);
    expect(output).toBe('Concatenate the feline category.');
  });
});
