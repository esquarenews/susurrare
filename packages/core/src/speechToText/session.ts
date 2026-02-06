import { HistoryItemSchema, type DiarizedSegment } from '../domain/schemas';
import { DEFAULT_PIPELINE } from '../pipeline/pipeline';
import type { PipelineContext, PipelineStage } from '../pipeline/types';
import type { TranscriptionClient, TranscriptionEvent } from '../transcription/types';
import { TranscriptionEventSchema } from '../transcription/types';
import type { TelemetryRecord, TelemetryStore } from '../telemetry/types';
import type {
  AudioChunk,
  CompletedOutcome,
  InsertionOutcome,
  ProcessedTranscript,
  SpeechToTextEvent,
  SpeechToTextSession,
  TranscriptionConfig,
} from './types';

export interface SpeechToTextDependencies {
  transcription: TranscriptionClient;
  insertText: (text: string) => Promise<{ success: boolean; method: 'accessibility' | 'clipboard' }>;
  clipboard: (text: string) => Promise<void>;
  history: { add: (item: ReturnType<typeof HistoryItemSchema.parse>) => Promise<void> };
  rewriteText?: (text: string, prompt: string) => Promise<string>;
  telemetry?: TelemetryStore;
  pipelineContext: PipelineContext;
  pipelineStages?: PipelineStage[];
  now?: () => number;
  idFactory?: () => string;
}

type SessionState = 'idle' | 'recording' | 'finalizing' | 'completed' | 'cancelled' | 'error';

const concatChunks = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
};

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

const formatSpeakerLabel = (speaker: string | undefined, index: number) => {
  if (!speaker) return `Speaker ${index + 1}`;
  const trimmed = speaker.trim();
  if (!trimmed) return `Speaker ${index + 1}`;
  if (/^speaker[_\s]?\d+$/i.test(trimmed)) {
    const number = trimmed.replace(/[^0-9]/g, '');
    return number ? `Speaker ${Number(number) + 1}` : 'Speaker';
  }
  if (/^speaker\b/i.test(trimmed)) return trimmed;
  return `Speaker ${trimmed}`;
};

const buildDiarizedTranscript = (segments: DiarizedSegment[]) => {
  if (!segments.length) return '';
  const lines: string[] = [];
  let lastLabel = '';
  segments.forEach((segment, index) => {
    const label = formatSpeakerLabel(segment.speaker, index);
    const text = segment.text.trim();
    if (!text) return;
    if (lines.length && label === lastLabel) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${text}`.trim();
    } else {
      lines.push(`${label}: ${text}`.trim());
      lastLabel = label;
    }
  });
  return lines.join('\n');
};

const resolveModelId = (model: TranscriptionConfig['model']) => {
  if (model.selection === 'pinned') {
    if (!model.pinnedModelId) {
      throw new Error('Pinned model selection requires pinnedModelId');
    }
    return model.pinnedModelId;
  }
  if (model.selection === 'fast') return 'gpt-4o-mini-transcribe';
  if (model.selection === 'meeting') return 'gpt-4o-transcribe-diarize';
  return 'gpt-4o-transcribe';
};

const applyPipeline = (
  input: string,
  context: PipelineContext,
  stages: PipelineStage[]
): { text: string; stepsApplied: string[] } => {
  let output = input;
  const steps: string[] = [];
  stages.forEach((stage) => {
    if (!stage.enabled(context)) return;
    steps.push(stage.id);
    output = stage.run(output, context);
  });
  return { text: output, stepsApplied: steps };
};

export const createSpeechToTextSession = (
  deps: SpeechToTextDependencies
): SpeechToTextSession => {
  let state: SessionState = 'idle';
  let config: TranscriptionConfig | null = null;
  let startedAt = 0;
  let audioDurationMs = 0;
  let finalText: string | null = null;
  let streamingText: string | null = null;
  let diarizedSegments: DiarizedSegment[] | null = null;
  let rawTranscriptText: string | null = null;
  let streamingHandle: Awaited<ReturnType<NonNullable<TranscriptionClient['openStream']>>> | null =
    null;
  let streamingFailed = false;
  let streamingReady: Promise<void> | null = null;
  let pendingChunks: Uint8Array[] = [];
  const bufferedChunks: Uint8Array[] = [];
  const listeners = new Set<(event: SpeechToTextEvent) => void>();

  const now = deps.now ?? (() => Date.now());
  const idFactory = deps.idFactory ?? (() => `hist-${Date.now()}`);

  const emit = (event: SpeechToTextEvent) => {
    listeners.forEach((listener) => listener(event));
  };

  const reset = () => {
    config = null;
    startedAt = 0;
    audioDurationMs = 0;
    finalText = null;
    streamingText = null;
    diarizedSegments = null;
    rawTranscriptText = null;
    streamingHandle = null;
    streamingFailed = false;
    streamingReady = null;
    pendingChunks = [];
    bufferedChunks.length = 0;
  };

  const startStreaming = async (request: Parameters<NonNullable<TranscriptionClient['openStream']>>[0]) => {
    if (!deps.transcription.openStream) {
      streamingFailed = true;
      return;
    }
    streamingReady = deps.transcription
      .openStream(request, (event: TranscriptionEvent) => {
        try {
          const parsed = TranscriptionEventSchema.parse(event);
          if (parsed.kind === 'partial') {
            streamingText = parsed.text;
            emit({
              type: 'partialTranscript',
              text: parsed.text,
              confidence: parsed.confidence,
              timestamp: parsed.timestamp,
            });
          }
          if (parsed.kind === 'final') {
            if (!finalText) {
              finalText = parsed.text;
            } else if (parsed.text.startsWith(finalText)) {
              finalText = parsed.text;
            } else if (!finalText.startsWith(parsed.text)) {
              finalText = `${finalText} ${parsed.text}`.trim();
            }
            if (parsed.segments?.length) {
              diarizedSegments = parsed.segments;
            }
          }
        } catch {
          // ignore malformed streaming events
        }
      })
      .then((handle) => {
        streamingHandle = handle;
        if (pendingChunks.length) {
          pendingChunks.forEach((chunk) => handle.sendAudio(chunk));
          pendingChunks = [];
        }
      })
      .catch((error) => {
        streamingFailed = true;
        emit({
          type: 'error',
          code: 'streaming_unavailable',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    await streamingReady;
  };

  const finalizeWithError = async (error: unknown, code: string) => {
    const message = error instanceof Error ? error.message : String(error);
    state = 'error';
    emit({ type: 'error', code, message });
    const historyItem = HistoryItemSchema.parse({
      id: idFactory(),
      text: '',
      createdAt: now(),
      pinned: false,
      status: 'failed',
      errorCode: code,
      errorMessage: message,
      modelId: config ? resolveModelId(config.model) : undefined,
      modeId: deps.pipelineContext.mode?.id,
      latencyMs: startedAt ? now() - startedAt : undefined,
      audioDurationMs,
    });
    try {
      await deps.history.add(historyItem);
    } catch {
      // ignore history persistence errors for failure records
    }
    emit({
      type: 'completed',
      outcome: {
        status: 'error',
        errorCode: code,
        errorMessage: message,
      },
    });
  };

  const finalizeSuccess = async (
    processed: ProcessedTranscript,
    insertion: InsertionOutcome
  ): Promise<boolean> => {
    const historyItem = HistoryItemSchema.parse({
      id: idFactory(),
      text: processed.text,
      rawText: rawTranscriptText ?? finalText ?? '',
      processedText: processed.text,
      diarizedSegments: diarizedSegments ?? undefined,
      wordCount: processed.wordCount,
      processingSteps: processed.stepsApplied,
      createdAt: now(),
      pinned: false,
      status: 'success',
      modelId: config ? resolveModelId(config.model) : undefined,
      modeId: deps.pipelineContext.mode?.id,
      latencyMs: startedAt ? now() - startedAt : undefined,
      audioDurationMs,
      insertion,
    });
    try {
      await deps.history.add(historyItem);
    } catch (error) {
      emit({
        type: 'error',
        code: 'history_failed',
        message: error instanceof Error ? error.message : String(error),
      });
      emit({
        type: 'completed',
        outcome: {
          status: 'error',
          errorCode: 'history_failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      return false;
    }
    if (deps.telemetry) {
      const record: TelemetryRecord = {
        id: `telemetry-${Date.now()}`,
        timestamp: now(),
        modelId: config ? resolveModelId(config.model) : 'unknown',
        latencyMs: startedAt ? now() - startedAt : 0,
        audioDurationMs,
        success: true,
      };
      try {
        await deps.telemetry.add(record);
      } catch {
        // ignore telemetry failures
      }
    }
    const outcome: CompletedOutcome = {
      status: insertion.outcome === 'inserted' ? 'inserted' : insertion.outcome,
      insertion,
    };
    emit({ type: 'completed', outcome });
    return true;
  };

  const start = async (nextConfig: TranscriptionConfig) => {
    if (state !== 'idle') return;
    state = 'recording';
    config = nextConfig;
    startedAt = now();
    finalText = null;
    streamingText = null;
    streamingFailed = false;
    bufferedChunks.length = 0;
    pendingChunks = [];
    if (config.streamingEnabled) {
      await startStreaming({
        audio: new Uint8Array(),
        model: config.model,
        language: config.language,
        silenceRemoval: config.silenceRemoval,
        maxLatencyHintMs: config.maxLatencyHintMs,
        sampleRate: config.sampleRate,
      });
    }
  };

  const pushAudioChunk = (chunk: AudioChunk) => {
    if (state !== 'recording') return;
    bufferedChunks.push(chunk.data);
    if (chunk.durationMs) audioDurationMs += chunk.durationMs;
    if (config?.streamingEnabled) {
      if (streamingHandle) {
        streamingHandle.sendAudio(chunk.data);
      } else {
        pendingChunks.push(chunk.data);
      }
    }
  };

  const finalize = async () => {
    if (state !== 'recording') return;
    state = 'finalizing';

    const request = config
      ? {
          audio: concatChunks(bufferedChunks),
          model: config.model,
          language: config.language,
          silenceRemoval: config.silenceRemoval,
          maxLatencyHintMs: config.maxLatencyHintMs,
          sampleRate: config.sampleRate,
        }
      : {
          audio: concatChunks(bufferedChunks),
          model: { selection: 'fast' as const },
        };

    if (config?.streamingEnabled && streamingHandle) {
      try {
        await streamingHandle.finalize();
      } catch (error) {
        streamingFailed = true;
        emit({
          type: 'error',
          code: 'streaming_unavailable',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (config?.streamingEnabled) {
      try {
        const events = await deps.transcription.transcribe(request);
        const finalEvent = events.find((event) => event.kind === 'final');
        if (finalEvent?.text) {
          finalText = finalEvent.text;
        }
        if (finalEvent?.segments?.length) {
          diarizedSegments = finalEvent.segments;
        }
      } catch (error) {
        if (!finalText && !streamingText) {
          await finalizeWithError(error, 'transcription_failed');
          reset();
          state = 'idle';
          return;
        }
      }
    } else if (!finalText || streamingFailed) {
      try {
        const events = await deps.transcription.transcribe(request);
        const finalEvent = events.find((event) => event.kind === 'final');
        finalText = finalEvent?.text ?? '';
        if (finalEvent?.segments?.length) {
          diarizedSegments = finalEvent.segments;
        }
      } catch (error) {
        await finalizeWithError(error, 'transcription_failed');
        reset();
        state = 'idle';
        return;
      }
    }

    rawTranscriptText = finalText ?? '';
    if (diarizedSegments && diarizedSegments.length) {
      const diarizedText = buildDiarizedTranscript(diarizedSegments);
      if (diarizedText) {
        rawTranscriptText = rawTranscriptText || diarizedText;
        finalText = diarizedText;
      }
    }

    const pipelineStages = deps.pipelineStages ?? DEFAULT_PIPELINE;
    let { text: processedText, stepsApplied } = applyPipeline(
      finalText ?? '',
      deps.pipelineContext,
      pipelineStages
    );
    const rewritePrompt = deps.pipelineContext.mode?.rewritePrompt?.trim();
    if (rewritePrompt && deps.rewriteText) {
      try {
        const rewritten = await deps.rewriteText(processedText, rewritePrompt);
        if (rewritten && rewritten.trim()) {
          processedText = rewritten.trim();
          stepsApplied = [...stepsApplied, 'prompt-rewrite'];
        }
      } catch (error) {
        emit({
          type: 'error',
          code: 'rewrite_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const processed: ProcessedTranscript = {
      text: processedText,
      wordCount: countWords(processedText),
      stepsApplied,
    };

    emit({
      type: 'finalTranscript',
      text: processed.text,
      metadata: {
        modelId: config ? resolveModelId(config.model) : 'unknown',
        language: config?.language,
        latencyMs: startedAt ? now() - startedAt : undefined,
        audioDurationMs,
      },
    });

    let insertion: InsertionOutcome = { outcome: 'failed' };
    try {
      const insertResult = await deps.insertText(processed.text);
      if (insertResult.success) {
        insertion = { outcome: 'inserted', method: insertResult.method };
      } else {
        await deps.clipboard(processed.text);
        insertion = { outcome: 'clipboard', method: 'clipboard' };
      }
    } catch {
      try {
        await deps.clipboard(processed.text);
        insertion = { outcome: 'clipboard', method: 'clipboard' };
      } catch (error) {
        insertion = { outcome: 'failed' };
        await finalizeWithError(error, 'insert_failed');
        reset();
        state = 'idle';
        return;
      }
    }

    const success = await finalizeSuccess(processed, insertion);
    if (success) {
      state = 'completed';
    } else {
      state = 'error';
    }
    reset();
    state = 'idle';
  };

  const cancel = async () => {
    if (state === 'idle') return;
    state = 'cancelled';
    if (streamingHandle) {
      streamingHandle.cancel();
    }
    const historyItem = HistoryItemSchema.parse({
      id: idFactory(),
      text: '',
      createdAt: now(),
      pinned: false,
      status: 'cancelled',
      modelId: config ? resolveModelId(config.model) : undefined,
      modeId: deps.pipelineContext.mode?.id,
      latencyMs: startedAt ? now() - startedAt : undefined,
      audioDurationMs,
    });
    try {
      await deps.history.add(historyItem);
    } catch {
      // ignore history persistence errors for cancelled sessions
    }
    emit({
      type: 'completed',
      outcome: { status: 'cancelled' },
    });
    reset();
    state = 'idle';
  };

  return {
    start,
    pushAudioChunk,
    finalize,
    cancel,
    onEvent: (listener: (event: SpeechToTextEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
  };
};
