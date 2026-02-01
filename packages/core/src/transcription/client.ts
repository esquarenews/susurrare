import {
  ModelSelectionSchema,
  type RetryPolicy,
  RetryPolicySchema,
  type TranscriptionClient,
  type TranscriptionClientOptions,
  type TranscriptionEvent,
  type TranscriptionRequest,
} from './types';

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
  return parsed.selection === 'fast' ? 'gpt-4o-mini-transcribe' : 'gpt-4o-transcribe';
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
      const wav = encodeWav(request.audio);
      const form = new FormData();
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
      form.append('model', modelId);
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
      if (contentType.includes('application/json')) {
        const data = (await response.json()) as { text?: string };
        text = data.text ?? '';
      } else {
        text = await response.text();
      }
      return [
        {
          kind: 'final',
          text,
          timestamp: Date.now(),
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
    if (isOpenAIBaseUrl(options.baseUrl)) {
      throw new Error('Streaming transcription is not available for this provider.');
    }
    const modelId = resolveModel(request.model);
    const ws = options.websocketFactory(`${options.baseUrl}/stream?model=${modelId}`);
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
    if (isOpenAIBaseUrl(options.baseUrl)) {
      const events = await transcribe(request);
      events.forEach((event) => onEvent(event));
      return;
    }
    const session = await openStream(request, onEvent);
    session.sendAudio(request.audio);
    await session.finalize();
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
