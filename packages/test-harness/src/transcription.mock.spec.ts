import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createTranscriptionClient, type WebSocketLike } from '@susurrare/core';
import { WebSocket } from 'ws';
import { startMockTranscriptionServer } from './mock/mockServer';

const loadFixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

describe('mock transcription server', () => {
  it('streams partials and final text', async () => {
    const server = await startMockTranscriptionServer({
      partials: ['Hello', 'Hello there'],
      finalText: 'Hello there friend',
    });

    const client = createTranscriptionClient({
      baseUrl: server.baseUrl,
      fetcher: fetch,
      websocketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
    });

    const received: string[] = [];
    await client.stream({
      audio: loadFixture('short.dictation.bin'),
      model: { selection: 'fast' },
    }, (event) => {
      received.push(event.text);
    });

    expect(received).toContain('Hello');
    expect(received[received.length - 1]).toBe('Hello there friend');
    await server.close();
  });

  it('handles http transcription', async () => {
    const server = await startMockTranscriptionServer({
      finalText: 'HTTP final result',
    });

    const client = createTranscriptionClient({
      baseUrl: server.baseUrl,
      fetcher: fetch,
      websocketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
    });

    const events = await client.transcribe({
      audio: loadFixture('long.dictation.bin'),
      model: { selection: 'accurate' },
    });

    expect(events[0].text).toBe('HTTP final result');
    await server.close();
  });

  it('simulates error on http', async () => {
    const server = await startMockTranscriptionServer();
    const fetcher: typeof fetch = (input, init) => {
      const url = typeof input === 'string' ? `${input}?error=fail` : input;
      return fetch(url, init);
    };
    const client = createTranscriptionClient({
      baseUrl: server.baseUrl,
      fetcher,
      websocketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
    });

    await expect(
      client.transcribe({ audio: loadFixture('noise.bin'), model: { selection: 'fast' } })
    ).rejects.toThrow();

    await server.close();
  });
});
