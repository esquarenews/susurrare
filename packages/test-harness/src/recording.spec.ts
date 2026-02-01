import { describe, expect, it, vi } from 'vitest';
import { createRecordingStateMachine, SettingsSchema, type VocabularyEntry } from '@susurrare/core';

const makeDeps = () => {
  const events: string[] = [];
  return {
    events,
    deps: {
      audio: {
        start: vi.fn(async () => ({ async *[Symbol.asyncIterator]() {} })),
        stop: vi.fn(async () => ({ data: new Uint8Array(), durationMs: 0 })),
        cancel: vi.fn(async () => undefined),
      },
      transcription: {
        transcribe: vi.fn(async () => [
          { kind: 'final' as const, text: 'hello world', timestamp: Date.now() },
        ]),
        stream: vi.fn(async (_req, cb) => {
          cb({ kind: 'partial' as const, text: 'hello', timestamp: Date.now() });
          cb({ kind: 'final' as const, text: 'hello world', timestamp: Date.now() });
        }),
      },
      insertText: vi.fn(async () => ({ success: true, method: 'accessibility' as const })),
      fallbackClipboard: vi.fn(async () => undefined),
      saveHistory: vi.fn(async (text) => {
        events.push(`history:${text}`);
      }),
      pipelineContext: {
        settings: SettingsSchema.parse({}),
        vocabulary: [] as VocabularyEntry[],
      },
    },
  } as const;
};

describe('recording state machine', () => {
  it('flows through recording to insert', async () => {
    const { deps, events } = makeDeps();
    let partial = '';
    let final = '';
    let inserted = false;

    const machine = createRecordingStateMachine(deps, {
      onPartialText: (t) => (partial = t),
      onFinalText: (t) => (final = t),
      onInsertResult: () => {
        inserted = true;
      },
    });

    await machine.start({ selection: 'fast' });
    await machine.stop();

    expect(partial).toBe('hello');
    expect(final).toBe('hello world');
    expect(inserted).toBe(true);
    expect(events).toContain('history:hello world');
    expect(machine.getState()).toBe('idle');
  });

  it('cancels cleanly', async () => {
    const { deps } = makeDeps();
    const machine = createRecordingStateMachine(deps);
    await machine.start({ selection: 'fast' });
    await machine.cancel();
    expect(machine.getState()).toBe('idle');
    expect(deps.audio.cancel).toHaveBeenCalled();
  });
});
