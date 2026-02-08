import { describe, expect, it, vi } from 'vitest';
import {
  createSpeechToTextSession,
  ModeSchema,
  SettingsSchema,
  type ShortcutEntry,
  type SpeechToTextEvent,
  type TranscriptionClient,
  type VocabularyEntry,
} from '@susurrare/core';

const baseContext = {
  settings: SettingsSchema.parse({}),
  shortcuts: [] as ShortcutEntry[],
  vocabulary: [] as VocabularyEntry[],
};

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
      insertText: vi.fn(async () => ({ success: true, method: 'accessibility' as const })),
      clipboard: vi.fn(async () => undefined),
      history: {
        add: vi.fn(async (item) => {
          history.push(item);
        }),
      },
      pipelineContext: baseContext,
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

  it('applies rewrite prompt before insertion', async () => {
    const events: SpeechToTextEvent[] = [];
    const clipboard = vi.fn(async () => undefined);
    const rewriteText = vi.fn(async () => 'HELLO FROM REWRITE');
    const insertText = vi.fn(async () => ({ success: true, method: 'accessibility' as const }));

    const transcription: TranscriptionClient = {
      transcribe: vi.fn(async () => [
        { kind: 'final' as const, text: 'hello from transcript', timestamp: Date.now() },
      ]),
      stream: vi.fn(async () => undefined),
    };

    const session = createSpeechToTextSession({
      transcription,
      insertText,
      clipboard,
      rewriteText,
      history: { add: vi.fn(async () => undefined) },
      pipelineContext: {
        ...baseContext,
        mode: ModeSchema.parse({
          id: 'mode-rewrite',
          name: 'Rewrite',
          model: { selection: 'fast' },
          streamingEnabled: false,
          punctuationNormalization: true,
          punctuationCommandsEnabled: false,
          shortcutsEnabled: false,
          formattingEnabled: false,
          formattingStyle: 'plain',
          rewritePrompt: 'Turn this into uppercase.',
          insertionBehavior: 'insert',
          vocabularySetIds: ['global'],
          createdAt: 0,
          updatedAt: 0,
        }),
      },
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: false });
    session.pushAudioChunk({ data: new Uint8Array([1, 2, 3]), timestamp: Date.now() });
    await session.finalize();

    expect(rewriteText).toHaveBeenCalledWith('hello from transcript', 'Turn this into uppercase.');
    expect(insertText).toHaveBeenCalledWith('HELLO FROM REWRITE');
    const final = events.find((event) => event.type === 'finalTranscript');
    expect(final && 'text' in final ? final.text : '').toBe('HELLO FROM REWRITE');
    expect(clipboard).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when direct insert reports failure', async () => {
    const events: SpeechToTextEvent[] = [];
    const clipboard = vi.fn(async () => undefined);
    const insertText = vi.fn(async () => ({ success: false, method: 'clipboard' as const }));

    const transcription: TranscriptionClient = {
      transcribe: vi.fn(async () => [
        { kind: 'final' as const, text: 'clipboard fallback text', timestamp: Date.now() },
      ]),
      stream: vi.fn(async () => undefined),
    };

    const session = createSpeechToTextSession({
      transcription,
      insertText,
      clipboard,
      history: { add: vi.fn(async () => undefined) },
      pipelineContext: baseContext,
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: false });
    session.pushAudioChunk({ data: new Uint8Array([1, 2, 3]), timestamp: Date.now() });
    await session.finalize();

    expect(clipboard).toHaveBeenCalledWith('clipboard fallback text');
    const completed = events.find((event) => event.type === 'completed');
    expect(completed && 'outcome' in completed ? completed.outcome.status : null).toBe('clipboard');
  });

  it('emits cancelled completion and records cancelled history on cancel', async () => {
    const events: SpeechToTextEvent[] = [];
    const addHistory = vi.fn(async () => undefined);

    const transcription: TranscriptionClient = {
      transcribe: vi.fn(async () => []),
      stream: vi.fn(async () => undefined),
      openStream: vi.fn(async () => ({
        sendAudio: () => undefined,
        finalize: async () => undefined,
        cancel: () => undefined,
      })),
    };

    const session = createSpeechToTextSession({
      transcription,
      insertText: vi.fn(async () => ({ success: true, method: 'accessibility' as const })),
      clipboard: vi.fn(async () => undefined),
      history: { add: addHistory },
      pipelineContext: baseContext,
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: true });
    await session.cancel();

    const completed = events.find((event) => event.type === 'completed');
    expect(completed && 'outcome' in completed ? completed.outcome.status : null).toBe('cancelled');
    expect(addHistory).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe('idle');
  });

  it('emits history_failed and error completion when success history write fails', async () => {
    const events: SpeechToTextEvent[] = [];

    const session = createSpeechToTextSession({
      transcription: {
        transcribe: vi.fn(async () => [
          { kind: 'final' as const, text: 'history will fail', timestamp: Date.now() },
        ]),
        stream: vi.fn(async () => undefined),
      },
      insertText: vi.fn(async () => ({ success: true, method: 'accessibility' as const })),
      clipboard: vi.fn(async () => undefined),
      history: {
        add: vi.fn(async () => {
          throw new Error('db unavailable');
        }),
      },
      pipelineContext: baseContext,
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: false });
    session.pushAudioChunk({ data: new Uint8Array([1]), timestamp: Date.now() });
    await session.finalize();

    const errorEvent = events.find(
      (event) => event.type === 'error' && 'code' in event && event.code === 'history_failed'
    );
    const completed = events.find((event) => event.type === 'completed');

    expect(errorEvent).toBeTruthy();
    expect(completed && 'outcome' in completed ? completed.outcome.status : null).toBe('error');
  });

  it('emits rewrite_failed and keeps original transcript when rewrite throws', async () => {
    const events: SpeechToTextEvent[] = [];
    const insertText = vi.fn(async () => ({ success: true, method: 'accessibility' as const }));

    const session = createSpeechToTextSession({
      transcription: {
        transcribe: vi.fn(async () => [
          { kind: 'final' as const, text: 'original transcript', timestamp: Date.now() },
        ]),
        stream: vi.fn(async () => undefined),
      },
      insertText,
      clipboard: vi.fn(async () => undefined),
      rewriteText: vi.fn(async () => {
        throw new Error('rewrite unavailable');
      }),
      history: { add: vi.fn(async () => undefined) },
      pipelineContext: {
        ...baseContext,
        mode: ModeSchema.parse({
          id: 'mode-rewrite-fails',
          name: 'RewriteFails',
          model: { selection: 'fast' },
          streamingEnabled: false,
          punctuationNormalization: true,
          punctuationCommandsEnabled: false,
          shortcutsEnabled: false,
          formattingEnabled: false,
          formattingStyle: 'plain',
          rewritePrompt: 'Rewrite this better',
          insertionBehavior: 'insert',
          vocabularySetIds: ['global'],
          createdAt: 0,
          updatedAt: 0,
        }),
      },
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: false });
    session.pushAudioChunk({ data: new Uint8Array([1]), timestamp: Date.now() });
    await session.finalize();

    expect(insertText).toHaveBeenCalledWith('original transcript');
    const rewriteError = events.find(
      (event) => event.type === 'error' && 'code' in event && event.code === 'rewrite_failed'
    );
    expect(rewriteError).toBeTruthy();
  });

  it('builds diarized transcript output and speaker labels from final segments', async () => {
    const insertText = vi.fn(async () => ({ success: true, method: 'accessibility' as const }));
    const historyItems: Array<{ text?: string; rawText?: string }> = [];

    const session = createSpeechToTextSession({
      transcription: {
        transcribe: vi.fn(async () => [
          {
            kind: 'final' as const,
            text: 'raw diarized text',
            timestamp: Date.now(),
            segments: [
              { speaker: 'speaker_0', start: 0, end: 1, text: 'hello' },
              { speaker: 'speaker_0', start: 1, end: 2, text: 'again' },
              { speaker: 'Alex', start: 2, end: 3, text: 'thanks' },
            ],
          },
        ]),
        stream: vi.fn(async () => undefined),
      },
      insertText,
      clipboard: vi.fn(async () => undefined),
      history: {
        add: vi.fn(async (item) => {
          historyItems.push(item as { text?: string; rawText?: string });
        }),
      },
      pipelineContext: baseContext,
    });

    await session.start({ model: { selection: 'meeting' }, streamingEnabled: false });
    session.pushAudioChunk({ data: new Uint8Array([1]), timestamp: Date.now() });
    await session.finalize();

    expect(insertText).toHaveBeenCalledWith('Speaker 1: hello again\nSpeaker Alex: thanks');
    expect(historyItems[0]?.rawText).toBe('raw diarized text');
  });

  it('emits insert_failed when insert and clipboard both fail', async () => {
    const events: SpeechToTextEvent[] = [];

    const session = createSpeechToTextSession({
      transcription: {
        transcribe: vi.fn(async () => [
          { kind: 'final' as const, text: 'cannot insert', timestamp: Date.now() },
        ]),
        stream: vi.fn(async () => undefined),
      },
      insertText: vi.fn(async () => {
        throw new Error('insert failed');
      }),
      clipboard: vi.fn(async () => {
        throw new Error('clipboard blocked');
      }),
      history: { add: vi.fn(async () => undefined) },
      pipelineContext: baseContext,
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: false });
    session.pushAudioChunk({ data: new Uint8Array([1]), timestamp: Date.now() });
    await session.finalize();

    const errorEvent = events.find(
      (event) => event.type === 'error' && 'code' in event && event.code === 'insert_failed'
    );
    const completed = events.find((event) => event.type === 'completed');

    expect(errorEvent).toBeTruthy();
    expect(completed && 'outcome' in completed ? completed.outcome.status : null).toBe('error');
    expect(session.getState()).toBe('idle');
  });

  it('continues when streaming finalize/transcribe fail but partial transcript exists', async () => {
    const events: SpeechToTextEvent[] = [];
    const insertText = vi.fn(async () => ({ success: true, method: 'accessibility' as const }));

    const session = createSpeechToTextSession({
      transcription: {
        transcribe: vi.fn(async () => {
          throw new Error('backend down');
        }),
        stream: vi.fn(async () => undefined),
        openStream: vi.fn(async (_request, onEvent) => ({
          sendAudio: () => {
            onEvent({ kind: 'partial', text: 'partial text', timestamp: Date.now() });
          },
          finalize: async () => {
            throw new Error('stream close failed');
          },
          cancel: () => undefined,
        })),
      },
      insertText,
      clipboard: vi.fn(async () => undefined),
      history: { add: vi.fn(async () => undefined) },
      pipelineContext: baseContext,
    });

    session.onEvent((event) => events.push(event));

    await session.start({ model: { selection: 'fast' }, streamingEnabled: true });
    session.pushAudioChunk({ data: new Uint8Array([1]), timestamp: Date.now() });
    await session.finalize();

    expect(insertText).toHaveBeenCalledWith('');
    const completed = events.find((event) => event.type === 'completed');
    expect(completed && 'outcome' in completed ? completed.outcome.status : null).toBe('inserted');
  });

  it('does not open another stream when start is called while already recording', async () => {
    const openStream = vi.fn(async () => ({
      sendAudio: () => undefined,
      finalize: async () => undefined,
      cancel: () => undefined,
    }));

    const session = createSpeechToTextSession({
      transcription: {
        transcribe: vi.fn(async () => [{ kind: 'final' as const, text: 'ok', timestamp: Date.now() }]),
        stream: vi.fn(async () => undefined),
        openStream,
      },
      insertText: vi.fn(async () => ({ success: true, method: 'accessibility' as const })),
      clipboard: vi.fn(async () => undefined),
      history: { add: vi.fn(async () => undefined) },
      pipelineContext: baseContext,
    });

    await session.start({ model: { selection: 'fast' }, streamingEnabled: true });
    await session.start({ model: { selection: 'fast' }, streamingEnabled: true });
    await session.cancel();

    expect(openStream).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes event listeners returned by onEvent', async () => {
    const observed: SpeechToTextEvent[] = [];

    const session = createSpeechToTextSession({
      transcription: {
        transcribe: vi.fn(async () => [
          { kind: 'final' as const, text: 'hello', timestamp: Date.now() },
        ]),
        stream: vi.fn(async () => undefined),
      },
      insertText: vi.fn(async () => ({ success: true, method: 'accessibility' as const })),
      clipboard: vi.fn(async () => undefined),
      history: { add: vi.fn(async () => undefined) },
      pipelineContext: baseContext,
    });

    const unsubscribe = session.onEvent((event) => observed.push(event));
    unsubscribe();

    await session.start({ model: { selection: 'fast' }, streamingEnabled: false });
    session.pushAudioChunk({ data: new Uint8Array([1]), timestamp: Date.now() });
    await session.finalize();

    expect(observed).toEqual([]);
  });
});
