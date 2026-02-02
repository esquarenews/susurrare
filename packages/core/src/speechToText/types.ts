import { z } from 'zod';
import { ModelSelectionSchema } from '../transcription/types';

export const TranscriptionConfigSchema = z.object({
  model: ModelSelectionSchema,
  streamingEnabled: z.boolean().default(true),
  language: z.string().optional(),
  silenceRemoval: z.boolean().optional(),
  maxLatencyHintMs: z.number().int().positive().optional(),
  sampleRate: z.number().int().positive().optional(),
});
export type TranscriptionConfig = z.infer<typeof TranscriptionConfigSchema>;

export interface AudioChunk {
  data: Uint8Array;
  timestamp: number;
  durationMs?: number;
}

export const ProcessedTranscriptSchema = z.object({
  text: z.string(),
  wordCount: z.number().int().min(0),
  confidence: z.number().min(0).max(1).optional(),
  stepsApplied: z.array(z.string()),
});
export type ProcessedTranscript = z.infer<typeof ProcessedTranscriptSchema>;

export const InsertionOutcomeSchema = z.object({
  outcome: z.enum(['inserted', 'clipboard', 'failed']),
  method: z.enum(['accessibility', 'clipboard']).optional(),
});
export type InsertionOutcome = z.infer<typeof InsertionOutcomeSchema>;

export interface TranscriptionMetadata {
  modelId: string;
  language?: string;
  latencyMs?: number;
  audioDurationMs?: number;
  confidence?: number;
}

export type CompletedOutcome = {
  status: 'inserted' | 'clipboard' | 'failed' | 'cancelled' | 'error';
  insertion?: InsertionOutcome;
  errorCode?: string;
  errorMessage?: string;
};

export type SpeechToTextEvent =
  | {
      type: 'partialTranscript';
      text: string;
      confidence?: number;
      timestamp: number;
    }
  | {
      type: 'finalTranscript';
      text: string;
      metadata: TranscriptionMetadata;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      retryable?: boolean;
    }
  | {
      type: 'completed';
      outcome: CompletedOutcome;
    };

export interface SpeechToTextSession {
  start(config: TranscriptionConfig): Promise<void>;
  pushAudioChunk(chunk: AudioChunk): void;
  finalize(): Promise<void>;
  cancel(): Promise<void>;
  onEvent(listener: (event: SpeechToTextEvent) => void): () => void;
  getState(): 'idle' | 'recording' | 'finalizing' | 'completed' | 'cancelled' | 'error';
}
