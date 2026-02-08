import { describe, expect, it } from 'vitest';
import { createTranscriptionClient, type WebSocketLike } from '@susurrare/core';

describe('transcription client', () => {
  it('resolves model selection', async () => {
    const client = createTranscriptionClient({
      baseUrl: 'https://example.com',
      fetcher: async () => ({ ok: true, json: async () => ({ text: 'ok' }) }) as Response,
      websocketFactory: () =>
        ({
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          send: () => undefined,
          close: () => undefined,
        }) as WebSocketLike,
    });

    const result = await client.transcribe({
      audio: new Uint8Array(),
      model: { selection: 'fast' },
    });

    expect(result[0].text).toBe('ok');
  });

  it('allows normal realtime close without transcript', async () => {
    let socketRef: WebSocketLike | null = null;
    const client = createTranscriptionClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      fetcher: async () => ({ ok: true, json: async () => ({ text: 'ok' }) }) as Response,
      websocketFactory: () => {
        const socket: WebSocketLike = {
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          send: (data) => {
            if (typeof data !== 'string') return;
            try {
              const parsed = JSON.parse(data) as { type?: string };
              if (parsed.type === 'input_audio_buffer.commit') {
                setTimeout(() => socket.onclose?.({ code: 1000, reason: '' }), 0);
              }
            } catch {
              // ignore malformed messages in test harness
            }
          },
          close: () => undefined,
        };
        socketRef = socket;
        setTimeout(() => socket.onopen?.({}), 0);
        return socket;
      },
    });

    const handle = await client.openStream?.(
      {
        audio: new Uint8Array(),
        model: { selection: 'fast' },
        sampleRate: 24000,
      },
      () => undefined
    );

    expect(handle).toBeTruthy();
    handle?.sendAudio(new Uint8Array(5000));
    await expect(handle?.finalize()).resolves.toBeUndefined();
    expect(socketRef).toBeTruthy();
  });
});
