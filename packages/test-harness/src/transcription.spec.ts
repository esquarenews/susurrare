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
});
