import type { PipelineStage } from './types';

export const whitespaceNormalizationStage: PipelineStage = {
  id: 'whitespace-normalization',
  enabled: () => true,
  run: (input) => input.replace(/\s+/g, ' ').trim(),
};

export const punctuationNormalizationStage: PipelineStage = {
  id: 'punctuation-normalization',
  enabled: (context) => context.settings.punctuationNormalization,
  run: (input) =>
    input
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/\.{3,}/g, '...')
      .replace(/\s{2,}/g, ' ')
      .trim(),
};

export const vocabularyReplacementStage: PipelineStage = {
  id: 'vocabulary-replacements',
  enabled: (context) => context.vocabulary.length > 0,
  run: (input, context) => {
    return context.vocabulary.reduce((acc, entry) => {
      if (!entry.source) return acc;
      const regex = new RegExp(`\\b${escapeRegExp(entry.source)}\\b`, 'gi');
      return acc.replace(regex, entry.replacement);
    }, input);
  },
};

export const keywordCommandStage: PipelineStage = {
  id: 'keyword-commands',
  enabled: () => true,
  run: (input) => input,
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
