import {
  ModelSelectionSchema,
  type RetryPolicy,
  RetryPolicySchema,
  type TranscriptionClient,
  type TranscriptionClientOptions,
  type TranscriptionEvent,
  type TranscriptionRequest,
} from './types';
import type { DiarizedSegment } from '../domain/schemas';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isOpenAIBaseUrl = (baseUrl: string) => baseUrl.includes('api.openai.com');

const joinUrl = (base: string, path: string) => {
  if (!base.endsWith('/') && !path.startsWith('/')) return `${base}/${path}`;
  if (base.endsWith('/') && path.startsWith('/')) return `${base}${path.slice(1)}`;
  return `${base}${path}`;
};

const resolveOpenAITranscriptionUrl = (baseUrl: string) => {
  if (baseUrl.includes('/v1/audio')) {
    return joinUrl(baseUrl, 'transcriptions');
  }
  if (baseUrl.endsWith('/v1')) {
    return joinUrl(baseUrl, 'audio/transcriptions');
  }
  if (baseUrl.includes('/v1/')) {
    return joinUrl(baseUrl, 'audio/transcriptions');
  }
  return joinUrl(baseUrl, '/v1/audio/transcriptions');
};

const resolveOpenAIRealtimeUrl = (baseUrl: string) => {
  const wsBase = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const v1Index = wsBase.indexOf('/v1');
  const root = v1Index >= 0 ? wsBase.slice(0, v1Index + 3) : wsBase.replace(/\/$/, '') + '/v1';
  const params = new URLSearchParams();
  params.set('intent', 'transcription');
  return `${root}/realtime?${params.toString()}`;
};

const encodeBase64 = (data: Uint8Array) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  let binary = '';
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  throw new Error('Base64 encoding is not available in this environment.');
};

const encodeWav = (pcm: Uint8Array, sampleRate = 16000, channels = 1, bitDepth = 16) => {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
};

const resolveModel = (model: TranscriptionRequest['model']) => {
  const parsed = ModelSelectionSchema.parse(model);
  if (parsed.selection === 'pinned') {
    if (!parsed.pinnedModelId) {
      throw new Error('Pinned model selection requires pinnedModelId');
    }
    return parsed.pinnedModelId;
  }
  if (parsed.selection === 'fast') return 'gpt-4o-mini-transcribe';
  if (parsed.selection === 'meeting') return 'gpt-4o-transcribe-diarize';
  return 'gpt-4o-transcribe';
};

const normalizeSegments = (value: unknown): DiarizedSegment[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const segments: DiarizedSegment[] = [];
  value.forEach((segment) => {
    if (!segment || typeof segment !== 'object') return;
    const record = segment as Record<string, unknown>;
    const start = Number(record.start);
    const end = Number(record.end);
    const text = typeof record.text === 'string' ? record.text : '';
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) return;
    segments.push({
      id: typeof record.id === 'string' ? record.id : undefined,
      speaker: typeof record.speaker === 'string' ? record.speaker : undefined,
      start,
      end,
      text,
    });
  });
  return segments.length ? segments : undefined;
};

export const createTranscriptionClient = (
  options: TranscriptionClientOptions,
  retryPolicy: RetryPolicy = RetryPolicySchema.parse({})
): TranscriptionClient => {
  const transcribe = async (request: TranscriptionRequest): Promise<TranscriptionEvent[]> => {
    const modelId = resolveModel(request.model);
    if (isOpenAIBaseUrl(options.baseUrl)) {
      if (!options.apiKey) {
        throw new Error('OpenAI API key is required for transcription.');
      }
      const url = resolveOpenAITranscriptionUrl(options.baseUrl);
      const wav = encodeWav(request.audio, request.sampleRate ?? 16000);
      const form = new FormData();
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
      form.append('model', modelId);
      if (modelId.includes('diarize')) {
        form.append('response_format', 'diarized_json');
        form.append('chunking_strategy', 'auto');
      }
      if (request.language) form.append('language', request.language);
      const response = await options.fetcher(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: form,
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Transcription failed: ${response.status} ${details}`);
      }
      const contentType = response.headers.get('content-type') ?? '';
      let text = '';
      let segments: DiarizedSegment[] | undefined;
      if (contentType.includes('application/json')) {
        const data = (await response.json()) as { text?: string; segments?: unknown };
        text = data.text ?? '';
        segments = normalizeSegments(data.segments);
      } else {
        text = await response.text();
      }
      return [
        {
          kind: 'final',
          text,
          timestamp: Date.now(),
          ...(segments ? { segments } : {}),
        },
      ];
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      Authorization: options.apiKey ? `Bearer ${options.apiKey}` : '',
      'X-Model-Id': modelId,
    };
    if (request.language) headers['X-Language'] = request.language;
    if (request.silenceRemoval !== undefined) {
      headers['X-Silence-Removal'] = request.silenceRemoval ? 'true' : 'false';
    }
    if (request.maxLatencyHintMs !== undefined) {
      headers['X-Max-Latency-Hint-Ms'] = String(request.maxLatencyHintMs);
    }
    const response = await options.fetcher(`${options.baseUrl}/transcriptions`, {
      method: 'POST',
      headers,
      body: request.audio,
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const data = (await response.json()) as { text: string };
    return [
      {
        kind: 'final',
        text: data.text,
        timestamp: Date.now(),
      },
    ];
  };

  const openStream = async (
    request: TranscriptionRequest,
    onEvent: (event: TranscriptionEvent) => void
  ) => {
    const transcriptionModelId = resolveModel(request.model);
    if (isOpenAIBaseUrl(options.baseUrl)) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required for realtime transcription.');
    }
      const url = resolveOpenAIRealtimeUrl(options.baseUrl);
      const ws = options.websocketFactory(url);
      let closed = false;
      let partialText = '';
      let sawTranscript = false;
      let bytesSent = 0;
      const debugEnabled =
        typeof process !== 'undefined' &&
        typeof process.env !== 'undefined' &&
        process.env.SUSURRARE_DEBUG_REALTIME === '1';
      let debugCount = 0;
      const debugLog = (label: string, detail?: unknown) => {
        if (!debugEnabled) return;
        if (debugCount > 40) return;
        debugCount += 1;
        if (detail === undefined) {
          // eslint-disable-next-line no-console
          console.debug(`[realtime] ${label}`);
        } else {
          // eslint-disable-next-line no-console
          console.debug(`[realtime] ${label}`, detail);
        }
      };
      const sampleRate = request.sampleRate ?? 24000;

      const ready = new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          try {
            const sessionUpdate = {
              type: 'transcription_session.update',
              session: {
                input_audio_format: 'pcm16',
                input_audio_transcription: {
                  model: transcriptionModelId,
                  language: request.language,
                },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.2,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
                input_audio_noise_reduction: {
                  type: 'near_field',
                },
                include: [],
              },
            };
            ws.send(JSON.stringify(sessionUpdate));
            debugLog('open', {
              transcriptionModel: transcriptionModelId,
              rate: sampleRate,
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        ws.onerror = () => reject(new Error('WebSocket error'));
      });

      let finalizeResolve: (() => void) | null = null;
      let finalizeReject: ((error: unknown) => void) | null = null;
      const finalize = new Promise<void>((resolve, reject) => {
        finalizeResolve = resolve;
        finalizeReject = reject;
      });
      finalize.catch(() => undefined);

      const extractMessageData = (message: unknown) => {
        if (typeof message === 'string') return message;
        if (message && typeof message === 'object' && 'data' in message) {
          return (message as { data?: unknown }).data;
        }
        return message;
      };

      ws.onmessage = (message) => {
        try {
          const data = extractMessageData(message);
          const text =
            typeof data === 'string'
              ? data
              : typeof Buffer !== 'undefined' && data instanceof Buffer
                ? data.toString('utf8')
                : data instanceof Uint8Array
                  ? new TextDecoder().decode(data)
                  : data instanceof ArrayBuffer
                    ? new TextDecoder().decode(new Uint8Array(data))
                  : String(data ?? '');
          const parsed = JSON.parse(text) as { type?: string; [key: string]: unknown };
          const type = parsed.type ?? '';
          if (type) {
            debugLog('event', type);
          } else {
            debugLog('event', parsed);
          }
          if (type === 'conversation.item.input_audio_transcription.delta') {
            const delta =
              (parsed.delta as string | undefined) ??
              (parsed.text as string | undefined) ??
              '';
            if (delta) {
              partialText = `${partialText}${delta}`;
              sawTranscript = true;
              onEvent({ kind: 'partial', text: partialText, timestamp: Date.now() });
            }
          }
          if (type === 'conversation.item.input_audio_transcription.completed') {
            const transcript =
              (parsed.transcript as string | undefined) ??
              (parsed.text as string | undefined) ??
              partialText;
            if (typeof transcript === 'string') {
              partialText = transcript;
              sawTranscript = true;
              onEvent({ kind: 'final', text: transcript, timestamp: Date.now() });
            }
            finalizeResolve?.();
          }
          if (type === 'error') {
            const errorPayload = parsed.error as { message?: string; code?: string } | undefined;
            let messageText = errorPayload?.message;
            if (!messageText) {
              messageText = typeof parsed.message === 'string' ? parsed.message : '';
            }
            if (!messageText) {
              messageText = 'Realtime error';
            }
            debugLog('error', { message: messageText, code: errorPayload?.code, raw: parsed });
            finalizeReject?.(new Error(messageText));
          }
        } catch (error) {
          finalizeReject?.(error);
        }
      };
      ws.onclose = (event) => {
        const code = (event as { code?: number })?.code;
        const reason = (event as { reason?: string })?.reason;
        if (!closed && !sawTranscript) {
          finalizeReject?.(
            new Error(`Realtime closed${code ? ` (${code})` : ''}${reason ? `: ${reason}` : ''}`)
          );
          return;
        }
        finalizeResolve?.();
      };
      ws.onerror = () => finalizeReject?.(new Error('WebSocket error'));

      await ready;

      return {
        sendAudio: (chunk: Uint8Array) => {
          if (closed) return;
          bytesSent += chunk.length;
          const payload = {
            type: 'input_audio_buffer.append',
            audio: encodeBase64(chunk),
          };
          ws.send(JSON.stringify(payload));
        },
        finalize: async () => {
          if (closed) return;
          try {
            const minBytes = Math.round((sampleRate * 0.1) * 2);
            if (bytesSent >= minBytes) {
              ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
            } else {
              debugLog('skip commit', { bytesSent, minBytes });
            }
          } catch {
            // ignore
          }
          try {
            await finalize;
          } finally {
            closed = true;
            ws.close();
          }
        },
        cancel: () => {
          if (closed) return;
          closed = true;
          ws.close();
        },
      };
    }

    const ws = options.websocketFactory(
      `${options.baseUrl}/stream?model=${encodeURIComponent(transcriptionModelId)}`
    );
    let closed = false;

    const ready = new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket error'));
    });

    let finalizeResolve: (() => void) | null = null;
    let finalizeReject: ((error: unknown) => void) | null = null;
    const finalize = new Promise<void>((resolve, reject) => {
      finalizeResolve = resolve;
      finalizeReject = reject;
    });

    ws.onmessage = (message) => {
      try {
        const data = (message as { data?: unknown })?.data;
        const parsed = JSON.parse(String(data ?? '')) as TranscriptionEvent;
        onEvent(parsed);
        if (parsed.kind === 'final') {
          finalizeResolve?.();
        }
      } catch (error) {
        finalizeReject?.(error);
      }
    };
    ws.onclose = () => finalizeResolve?.();
    ws.onerror = () => finalizeReject?.(new Error('WebSocket error'));

    await ready;

    return {
      sendAudio: (chunk: Uint8Array) => {
        if (closed) return;
        ws.send(chunk);
      },
      finalize: async () => {
        if (closed) return;
        try {
          ws.send(new Uint8Array());
        } catch {
          // ignore
        }
        try {
          await finalize;
        } finally {
          closed = true;
          ws.close();
        }
      },
      cancel: () => {
        if (closed) return;
        closed = true;
        ws.close();
      },
    };
  };

  const stream = async (
    request: TranscriptionRequest,
    onEvent: (event: TranscriptionEvent) => void
  ): Promise<void> => {
    try {
      const session = await openStream(request, onEvent);
      session.sendAudio(request.audio);
      await session.finalize();
      return;
    } catch {
      const events = await transcribe(request);
      events.forEach((event) => onEvent(event));
    }
  };

  const transcribeWithFallback = async (request: TranscriptionRequest) => {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < retryPolicy.maxAttempts) {
      try {
        return await transcribe(request);
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= retryPolicy.maxAttempts) break;
        await delay(retryPolicy.baseDelayMs * attempt);
      }
    }

    throw lastError ?? new Error('Transcription failed');
  };

  return {
    transcribe,
    stream,
    openStream,
    transcribeWithFallback,
  } as TranscriptionClient & { transcribeWithFallback: typeof transcribeWithFallback };
};
