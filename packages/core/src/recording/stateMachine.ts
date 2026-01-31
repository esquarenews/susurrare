import { runPipeline } from '../pipeline/pipeline';
import type { PipelineContext } from '../pipeline/types';
import type {
  ModelSelection,
  TranscriptionClient,
  TranscriptionEvent,
  TranscriptionRequest,
} from '../transcription/types';

export interface InsertResult {
  success: boolean;
  method: 'accessibility' | 'clipboard';
}

export type RecordingState = 'idle' | 'recording' | 'finalizing' | 'inserting' | 'error';

export interface RecordingDependencies {
  audio: {
    start: () => Promise<AsyncIterable<{ data: Uint8Array; timestamp: number }>>;
    stop: () => Promise<{ data: Uint8Array; durationMs: number }>;
    cancel: () => Promise<void>;
  };
  transcription: TranscriptionClient;
  streamingEnabled?: () => boolean;
  insertText: (text: string) => Promise<InsertResult>;
  fallbackClipboard: (text: string) => Promise<void>;
  saveHistory: (text: string) => Promise<void>;
  pipelineContext: PipelineContext;
  pipelineStages?: Parameters<typeof runPipeline>[2];
}

export interface RecordingHooks {
  onPartialText?: (text: string) => void;
  onFinalText?: (text: string) => void;
  onInsertResult?: (result: InsertResult) => void;
  onError?: (error: unknown) => void;
}

export interface RecordingController {
  getState(): RecordingState;
  start(model: ModelSelection): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
}

export const createRecordingStateMachine = (
  deps: RecordingDependencies,
  hooks: RecordingHooks = {}
): RecordingController => {
  let state: RecordingState = 'idle';
  let streamedFinalText: string | null = null;
  let currentModel: ModelSelection = { selection: 'fast' };

  const safeSetState = (next: RecordingState) => {
    state = next;
  };

  const start = async (model: ModelSelection) => {
    if (state !== 'idle') return;
    safeSetState('recording');
    streamedFinalText = null;
    currentModel = model;

    await deps.audio.start();

    // Fire and forget streaming; errors handled in onError and final fallback
    (async () => {
      if (deps.streamingEnabled && !deps.streamingEnabled()) return;
      try {
        const request: TranscriptionRequest = {
          audio: new Uint8Array(),
          model,
        };
        await deps.transcription.stream(
          request,
          (event: TranscriptionEvent) => {
            if (event.kind === 'partial') hooks.onPartialText?.(event.text);
            if (event.kind === 'final') {
              streamedFinalText = event.text;
              hooks.onFinalText?.(event.text);
            }
          }
        );
      } catch (error) {
        hooks.onError?.(error);
      }
    })();
  };

  const stop = async () => {
    if (state !== 'recording') return;
    safeSetState('finalizing');
    let finalText = streamedFinalText;
    try {
      await deps.audio.stop();
      if (!finalText) {
        const request: TranscriptionRequest = {
          audio: new Uint8Array(),
          model: currentModel,
        };
        const events = await deps.transcription.transcribe(request);
        const finalEvent = events.find((e) => e.kind === 'final');
        finalText = finalEvent?.text ?? '';
        hooks.onFinalText?.(finalText);
      }
      safeSetState('inserting');
      const processed = runPipeline(finalText ?? '', deps.pipelineContext, deps.pipelineStages);
      let insertResult: InsertResult;
      try {
        insertResult = await deps.insertText(processed);
        if (!insertResult.success) {
          await deps.fallbackClipboard(processed);
        }
      } catch (error) {
        await deps.fallbackClipboard(processed);
        insertResult = { success: false, method: 'clipboard' };
        hooks.onError?.(error);
      }
      hooks.onInsertResult?.(insertResult);
      await deps.saveHistory(processed);
      safeSetState('idle');
    } catch (error) {
      hooks.onError?.(error);
      safeSetState('error');
    } finally {
      safeSetState('idle');
    }
  };

  const cancel = async () => {
    if (state === 'idle') return;
    try {
      await deps.audio.cancel();
    } finally {
      streamedFinalText = null;
      safeSetState('idle');
    }
  };

  return {
    getState: () => state,
    start,
    stop,
    cancel,
  };
};
