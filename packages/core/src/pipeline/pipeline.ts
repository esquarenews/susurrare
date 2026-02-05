import type { PipelineContext, PipelineStage } from './types';
import {
  formattingCommandStage,
  keywordCommandStage,
  punctuationNormalizationStage,
  shortcutStage,
  vocabularyReplacementStage,
  whitespaceNormalizationStage,
} from './stages';

export const DEFAULT_PIPELINE: PipelineStage[] = [
  whitespaceNormalizationStage,
  shortcutStage,
  formattingCommandStage,
  punctuationNormalizationStage,
  vocabularyReplacementStage,
  keywordCommandStage,
];

export const runPipeline = (
  input: string,
  context: PipelineContext,
  stages: PipelineStage[] = DEFAULT_PIPELINE
) => {
  return stages.reduce((acc, stage) => {
    if (!stage.enabled(context)) return acc;
    return stage.run(acc, context);
  }, input);
};
