import { z } from 'zod';

export const ModelSelectionSchema = z.object({
  selection: z.enum(['fast', 'accurate', 'meeting', 'pinned']),
  pinnedModelId: z.string().optional(),
});
export type ModelSelection = z.infer<typeof ModelSelectionSchema>;

export const TranscriptionEventSchema = z.object({
  kind: z.enum(['partial', 'final']),
  text: z.string(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1).optional(),
  language: z.string().optional(),
});
export type TranscriptionEvent = z.infer<typeof TranscriptionEventSchema>;

export interface TranscriptionRequest {
  audio: Uint8Array;
  model: ModelSelection;
  language?: string;
  silenceRemoval?: boolean;
  maxLatencyHintMs?: number;
  sampleRate?: number;
}

export interface StreamingTranscriptionHandle {
  sendAudio: (chunk: Uint8Array) => void;
  finalize: () => Promise<void>;
  cancel: () => void;
}

export interface TranscriptionClient {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionEvent[]>;
  stream(request: TranscriptionRequest, onEvent: (event: TranscriptionEvent) => void): Promise<void>;
  openStream?: (
    request: TranscriptionRequest,
    onEvent: (event: TranscriptionEvent) => void
  ) => Promise<StreamingTranscriptionHandle>;
}

export type WebSocketLike = {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send: (data: Uint8Array | string) => void;
  close: () => void;
};

export interface TranscriptionClientOptions {
  fetcher: typeof fetch;
  websocketFactory: (url: string) => WebSocketLike;
  baseUrl: string;
  apiKey?: string;
}

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5).default(2),
  baseDelayMs: z.number().int().min(50).default(200),
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
