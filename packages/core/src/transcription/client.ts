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

const resolveModel = (model: TranscriptionRequest['model']) => {
  const parsed = ModelSelectionSchema.parse(model);
  if (parsed.selection === 'pinned') {
    if (!parsed.pinnedModelId) {
      throw new Error('Pinned model selection requires pinnedModelId');
    }
    return parsed.pinnedModelId;
  }
  return parsed.selection === 'fast' ? 'gpt-stt-realtime' : 'gpt-stt-accurate';
};

export const createTranscriptionClient = (
  options: TranscriptionClientOptions,
  retryPolicy: RetryPolicy = RetryPolicySchema.parse({})
): TranscriptionClient => {
  const transcribe = async (request: TranscriptionRequest): Promise<TranscriptionEvent[]> => {
    const modelId = resolveModel(request.model);
    const response = await options.fetcher(`${options.baseUrl}/transcriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: options.apiKey ? `Bearer ${options.apiKey}` : '',
        'X-Model-Id': modelId,
      },
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

  const stream = async (
    request: TranscriptionRequest,
    onEvent: (event: TranscriptionEvent) => void
  ): Promise<void> => {
    const modelId = resolveModel(request.model);
    const ws = options.websocketFactory(`${options.baseUrl}/stream?model=${modelId}`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket error'));
    });

    ws.send(request.audio);

    await new Promise<void>((resolve, reject) => {
      ws.onmessage = (message) => {
        try {
          const data = (message as { data?: unknown })?.data;
          const parsed = JSON.parse(String(data ?? '')) as TranscriptionEvent;
          onEvent(parsed);
          if (parsed.kind === 'final') {
            resolve();
            ws.close();
          }
        } catch (error) {
          reject(error);
        }
      };
      ws.onclose = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket error'));
    });
  };

  const transcribeWithFallback = async (request: TranscriptionRequest) => {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < retryPolicy.maxAttempts) {
      try {
        await stream(request, () => undefined);
        return transcribe(request);
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
    transcribeWithFallback,
  } as TranscriptionClient & { transcribeWithFallback: typeof transcribeWithFallback };
};
