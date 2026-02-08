import { describe, expect, it, vi } from 'vitest';
import { createTranscriptionClient, type WebSocketLike } from '@susurrare/core';

interface MockSocket extends WebSocketLike {
  sent: Array<Uint8Array | string>;
  closed: boolean;
  emitOpen: () => void;
  emitMessage: (data: unknown) => void;
  emitRawMessage: (message: unknown) => void;
  emitClose: (event?: unknown) => void;
  emitError: (event?: unknown) => void;
}

const createMockSocket = (): MockSocket => {
  const socket: MockSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    sent: [],
    closed: false,
    send: (data) => {
      socket.sent.push(data);
    },
    close: () => {
      socket.closed = true;
    },
    emitOpen: () => {
      socket.onopen?.({});
    },
    emitMessage: (data) => {
      socket.onmessage?.({ data });
    },
    emitRawMessage: (message) => {
      (socket.onmessage as ((ev: unknown) => void) | null)?.(message);
    },
    emitClose: (event = {}) => {
      socket.onclose?.(event);
    },
    emitError: (event = {}) => {
      socket.onerror?.(event);
    },
  };
  return socket;
};

describe('transcription client', () => {
  it('resolves model selection', async () => {
    const client = createTranscriptionClient({
      baseUrl: 'https://example.com',
      fetcher: async () => ({ ok: true, json: async () => ({ text: 'ok' }) }) as Response,
      websocketFactory: () => createMockSocket(),
    });

    const result = await client.transcribe({
      audio: new Uint8Array(),
      model: { selection: 'fast' },
    });

    expect(result[0].text).toBe('ok');
  });

  it('requires OpenAI API key for OpenAI transcription base URL', async () => {
    const client = createTranscriptionClient({
      baseUrl: 'https://api.openai.com/v1/audio',
      fetcher: async () => ({ ok: true, json: async () => ({ text: 'ok' }) }) as Response,
      websocketFactory: () => createMockSocket(),
    });

    await expect(
      client.transcribe({
        audio: new Uint8Array(),
        model: { selection: 'fast' },
      })
    ).rejects.toThrow('OpenAI API key is required for transcription.');
  });

  it('sends OpenAI diarized request and normalizes returned segments', async () => {
    let capturedUrl = '';
    let capturedBody: FormData | null = null;

    const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = (init?.body ?? null) as FormData | null;
      return new Response(
        JSON.stringify({
          text: 'meeting text',
          segments: [
            { id: 'seg-1', speaker: 'speaker_0', start: 0, end: 1, text: 'Hello' },
            { id: 'seg-2', speaker: 'speaker_1', start: 'bad', end: 2, text: 'Ignored' },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    });

    const client = createTranscriptionClient({
      baseUrl: 'https://api.openai.com/v1/audio',
      apiKey: 'test-key',
      fetcher,
      websocketFactory: () => createMockSocket(),
    });

    const result = await client.transcribe({
      audio: new Uint8Array([1, 2, 3, 4]),
      model: { selection: 'meeting' },
      language: 'en',
      sampleRate: 16000,
    });

    expect(capturedUrl).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(capturedBody).toBeInstanceOf(FormData);
    const getField = (key: string) =>
      (capturedBody as unknown as { get: (name: string) => unknown }).get(key);
    expect(getField('model')).toBe('gpt-4o-transcribe-diarize');
    expect(getField('response_format')).toBe('diarized_json');
    expect(getField('chunking_strategy')).toBe('auto');
    expect(getField('language')).toBe('en');
    expect(result[0].text).toBe('meeting text');
    expect(result[0].segments).toEqual([
      {
        id: 'seg-1',
        speaker: 'speaker_0',
        start: 0,
        end: 1,
        text: 'Hello',
      },
    ]);
  });

  it.each([
    ['https://api.openai.com/v1', 'https://api.openai.com/v1/audio/transcriptions'],
    ['https://api.openai.com/proxy/v1/tenant', 'https://api.openai.com/proxy/v1/tenant/audio/transcriptions'],
    ['https://api.openai.com', 'https://api.openai.com/v1/audio/transcriptions'],
  ])('resolves OpenAI transcription URL from %s', async (baseUrl, expectedUrl) => {
    let calledUrl = '';
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      calledUrl = String(url);
      return new Response('plain transcript', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    });

    const client = createTranscriptionClient({
      baseUrl,
      apiKey: 'test-key',
      fetcher,
      websocketFactory: () => createMockSocket(),
    });

    const result = await client.transcribe({
      audio: new Uint8Array([1]),
      model: { selection: 'accurate' },
    });

    expect(calledUrl).toBe(expectedUrl);
    expect(result[0].text).toBe('plain transcript');
  });

  it('sends non-openai headers for language, silence removal, and latency hints', async () => {
    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ text: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createTranscriptionClient({
      baseUrl: 'https://example.com/api',
      apiKey: 'token-123',
      fetcher,
      websocketFactory: () => createMockSocket(),
    });

    await client.transcribe({
      audio: new Uint8Array([7, 8]),
      model: { selection: 'pinned', pinnedModelId: 'custom-model' },
      language: 'fr',
      silenceRemoval: true,
      maxLatencyHintMs: 350,
    });

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer token-123');
    expect(headers['X-Model-Id']).toBe('custom-model');
    expect(headers['X-Language']).toBe('fr');
    expect(headers['X-Silence-Removal']).toBe('true');
    expect(headers['X-Max-Latency-Hint-Ms']).toBe('350');
  });

  it('throws on non-openai transcription HTTP failure', async () => {
    const client = createTranscriptionClient({
      baseUrl: 'https://example.com',
      fetcher: vi.fn(async () => new Response('nope', { status: 503 })),
      websocketFactory: () => createMockSocket(),
    });

    await expect(
      client.transcribe({
        audio: new Uint8Array([1]),
        model: { selection: 'fast' },
      })
    ).rejects.toThrow('Transcription failed: 503');
  });

  it('handles OpenAI realtime websocket events and commits when enough audio is sent', async () => {
    const socket = createMockSocket();
    const websocketFactory = vi.fn(() => socket);
    const client = createTranscriptionClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      fetcher: vi.fn(async () => new Response(JSON.stringify({ text: 'fallback' }), { status: 200 })),
      websocketFactory,
    });

    const events: string[] = [];
    const handlePromise = client.openStream!(
      {
        audio: new Uint8Array(),
        model: { selection: 'fast' },
        language: 'en',
      },
      (event) => {
        events.push(`${event.kind}:${event.text}`);
      }
    );

    socket.emitOpen();
    const handle = await handlePromise;

    expect(websocketFactory).toHaveBeenCalledWith('wss://api.openai.com/v1/realtime?intent=transcription');
    expect(socket.sent.length).toBeGreaterThan(0);

    const sessionUpdate = JSON.parse(String(socket.sent[0])) as { type: string; session: { input_audio_transcription: { model: string; language?: string } } };
    expect(sessionUpdate.type).toBe('transcription_session.update');
    expect(sessionUpdate.session.input_audio_transcription.model).toBe('gpt-4o-mini-transcribe');
    expect(sessionUpdate.session.input_audio_transcription.language).toBe('en');

    handle.sendAudio(new Uint8Array(5000));

    const delta = new TextEncoder().encode(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'hel',
      })
    );
    socket.emitRawMessage({ data: delta });
    socket.emitRawMessage(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hello',
      })
    );

    await handle.finalize();

    const sentTypes = socket.sent
      .filter((payload): payload is string => typeof payload === 'string')
      .map((payload) => {
        try {
          return (JSON.parse(payload) as { type?: string }).type ?? '';
        } catch {
          return '';
        }
      });

    expect(sentTypes).toContain('input_audio_buffer.append');
    expect(sentTypes).toContain('input_audio_buffer.commit');
    expect(events).toEqual(['partial:hel', 'final:hello']);
    expect(socket.closed).toBe(true);
  });

  it('requires OpenAI API key for realtime stream setup', async () => {
    const client = createTranscriptionClient({
      baseUrl: 'https://api.openai.com/v1',
      fetcher: vi.fn(async () => new Response(JSON.stringify({ text: 'ok' }), { status: 200 })),
      websocketFactory: () => createMockSocket(),
    });

    await expect(
      client.openStream!(
        {
          audio: new Uint8Array([1]),
          model: { selection: 'fast' },
        },
        () => undefined
      )
    ).rejects.toThrow('OpenAI API key is required for realtime transcription.');
  });

  it('falls back to HTTP transcription when OpenAI realtime stream errors', async () => {
    const socket = createMockSocket();
    const originalSend = socket.send.bind(socket);
    socket.send = (payload) => {
      originalSend(payload);
      if (typeof payload !== 'string') return;
      try {
        const parsed = JSON.parse(payload) as { type?: string };
        if (parsed.type === 'input_audio_buffer.append') {
          socket.emitRawMessage(JSON.stringify({ type: 'error', message: 'ws failed' }));
        }
      } catch {
        // ignore malformed payloads
      }
    };

    const websocketFactory = vi.fn(() => socket);
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ text: 'fallback transcript' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const client = createTranscriptionClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      fetcher,
      websocketFactory,
    });

    const streamed: string[] = [];
    const streamPromise = client.stream(
      {
        audio: new Uint8Array([1, 2, 3]),
        model: { selection: 'fast' },
      },
      (event) => streamed.push(event.text)
    );

    socket.emitOpen();
    await streamPromise;

    expect(websocketFactory).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(streamed).toContain('fallback transcript');
  });

  it('supports non-openai openStream flow', async () => {
    const socket = createMockSocket();

    const client = createTranscriptionClient({
      baseUrl: 'https://example.com',
      fetcher: vi.fn(async () => new Response(JSON.stringify({ text: 'ignored' }), { status: 200 })),
      websocketFactory: vi.fn(() => socket),
    });

    const events: string[] = [];
    const handlePromise = client.openStream!(
      {
        audio: new Uint8Array(),
        model: { selection: 'fast' },
      },
      (event) => events.push(`${event.kind}:${event.text}`)
    );

    socket.emitOpen();
    const handle = await handlePromise;

    handle.sendAudio(new Uint8Array([9, 8, 7]));
    socket.emitMessage(JSON.stringify({ kind: 'partial', text: 'part', timestamp: Date.now() }));
    socket.emitMessage(JSON.stringify({ kind: 'final', text: 'done', timestamp: Date.now() }));
    await handle.finalize();

    const sentBinary = socket.sent.filter((payload) => payload instanceof Uint8Array) as Uint8Array[];
    expect(sentBinary.some((chunk) => chunk.length === 3)).toBe(true);
    expect(sentBinary.some((chunk) => chunk.length === 0)).toBe(true);
    expect(events).toEqual(['partial:part', 'final:done']);
    expect(socket.closed).toBe(true);
  });

  it('retries transcribeWithFallback and eventually succeeds', async () => {
    let attempts = 0;
    const fetcher = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) {
        return new Response('try again', { status: 500 });
      }
      return new Response(JSON.stringify({ text: 'recovered' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createTranscriptionClient(
      {
        baseUrl: 'https://example.com',
        fetcher,
        websocketFactory: () => createMockSocket(),
      },
      { maxAttempts: 3, baseDelayMs: 1 }
    ) as ReturnType<typeof createTranscriptionClient> & {
      transcribeWithFallback: (request: {
        audio: Uint8Array;
        model: { selection: 'fast' | 'accurate' | 'meeting' | 'pinned'; pinnedModelId?: string };
      }) => Promise<Array<{ text: string }>>;
    };

    const result = await client.transcribeWithFallback({
      audio: new Uint8Array([1]),
      model: { selection: 'fast' },
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result[0].text).toBe('recovered');
  });

  it('throws last error when transcribeWithFallback exhausts retries', async () => {
    const fetcher = vi.fn(async () => new Response('down', { status: 502 }));
    const client = createTranscriptionClient(
      {
        baseUrl: 'https://example.com',
        fetcher,
        websocketFactory: () => createMockSocket(),
      },
      { maxAttempts: 2, baseDelayMs: 1 }
    ) as ReturnType<typeof createTranscriptionClient> & {
      transcribeWithFallback: (request: { audio: Uint8Array; model: { selection: 'fast' } }) => Promise<Array<{ text: string }>>;
    };

    await expect(
      client.transcribeWithFallback({
        audio: new Uint8Array([1]),
        model: { selection: 'fast' },
      })
    ).rejects.toThrow('Transcription failed: 502');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
