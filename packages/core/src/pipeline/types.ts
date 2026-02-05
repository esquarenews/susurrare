import type { Mode, Settings, VocabularyEntry, ShortcutEntry } from '../domain/schemas';

export interface PipelineContext {
  mode?: Mode;
  settings: Settings;
  vocabulary: VocabularyEntry[];
  shortcuts: ShortcutEntry[];
}

export interface PipelineStage {
  id: string;
  enabled: (context: PipelineContext) => boolean;
  run: (input: string, context: PipelineContext) => string;
}

export interface KeywordCommandResult {
  cleanedText: string;
  commands: Array<{ keyword: string; payload?: string }>;
}
