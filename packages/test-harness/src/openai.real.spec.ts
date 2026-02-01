import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { createTranscriptionClient, type WebSocketLike } from '@susurrare/core';
import { WebSocket } from 'ws';

const baseUrl = process.env.OPENAI_BASE_URL;
const apiKey = process.env.OPENAI_API_KEY;

const hasCredentials = Boolean(baseUrl && apiKey);

const loadFixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

describe('real OpenAI transcription (optional)', () => {
  const testFn = hasCredentials ? it : it.skip;

  testFn('transcribes short dictation via HTTP', async () => {
    if (!baseUrl || !apiKey) return;
    const client = createTranscriptionClient({
      baseUrl,
      apiKey,
      fetcher: fetch,
      websocketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
    });

    const events = await client.transcribe({
      audio: loadFixture('short.dictation.bin'),
      model: { selection: 'fast' },
    });

    if (!events[0]?.text) {
      throw new Error('Expected transcription text');
    }
  });
});
