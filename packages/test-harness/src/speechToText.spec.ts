import { describe, expect, it, vi } from 'vitest';
import {
  createSpeechToTextSession,
  SettingsSchema,
  type SpeechToTextEvent,
  type TranscriptionClient,
  type VocabularyEntry,
} from '@susurrare/core';

describe('speech-to-text golden path', () => {
  it('streams partials, finalizes, inserts, and saves history', async () => {
    const events: SpeechToTextEvent[] = [];
    const history: Array<unknown> = [];

    const transcription: TranscriptionClient = {
      transcribe: vi.fn(async () => [
        { kind: 'final' as const, text: 'HTTP fallback', timestamp: Date.now() },
      ]),
      stream: vi.fn(async () => undefined),
      openStream: vi.fn(async (_req, onEvent) => {
        return {
          sendAudio: () => {
            onEvent({ kind: 'partial', text: 'Hello', timestamp: Date.now() });
          },
          finalize: async () => {
            onEvent({ kind: 'final', text: 'Hello world', timestamp: Date.now() });
          },
          cancel: () => undefined,
        };
      }),
    };

    const session = createSpeechToTextSession({
      transcription,
      insertText: vi.fn(
        async () => ({ success: true, method: 'accessibility' as const })
      ),
      clipboard: vi.fn(async () => undefined),
      history: {
        add: vi.fn(async (item) => {
          history.push(item);
        }),
      },
      pipelineContext: {
        settings: SettingsSchema.parse({}),
        vocabulary: [] as VocabularyEntry[],
      },
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: true });
    session.pushAudioChunk({ data: new Uint8Array([1, 2, 3]), timestamp: Date.now() });
    await session.finalize();

    expect(events.some((event) => event.type === 'partialTranscript')).toBe(true);
    const final = events.find((event) => event.type === 'finalTranscript');
    expect(final && 'text' in final ? final.text : '').toBe('HTTP fallback');
    expect(history.length).toBe(1);
  });
});
