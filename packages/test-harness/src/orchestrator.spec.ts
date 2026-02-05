import { describe, expect, it, vi } from 'vitest';
import {
  createRecordingStateMachine,
  SettingsSchema,
  type ShortcutEntry,
  type VocabularyEntry,
} from '@susurrare/core';

const makeDeps = () => {
  const clipboard: string[] = [];
  return {
    clipboard,
    deps: {
      audio: {
        start: vi.fn(async () => ({ async *[Symbol.asyncIterator]() {} })),
        stop: vi.fn(async () => ({ data: new Uint8Array(), durationMs: 50 })),
        cancel: vi.fn(async () => undefined),
      },
      transcription: {
        transcribe: vi.fn(async () => [
          { kind: 'final' as const, text: 'mock final', timestamp: Date.now() },
        ]),
        stream: vi.fn(async (_req, cb) => {
          cb({ kind: 'partial' as const, text: 'mock', timestamp: Date.now() });
          cb({ kind: 'final' as const, text: 'mock final', timestamp: Date.now() });
        }),
      },
      insertText: vi.fn(async () => {
        return { success: false, method: 'clipboard' as const };
      }),
      fallbackClipboard: vi.fn(async (text) => {
        clipboard.push(text);
      }),
      saveHistory: vi.fn(async () => undefined),
      pipelineContext: {
        settings: SettingsSchema.parse({}),
        shortcuts: [] as ShortcutEntry[],
        vocabulary: [] as VocabularyEntry[],
      },
    },
  };
};

describe('orchestrator flow with mocked platform', () => {
  it('falls back to clipboard when insert fails', async () => {
    const { deps, clipboard } = makeDeps();
    const machine = createRecordingStateMachine(deps);
    await machine.start({ selection: 'fast' });
    await machine.stop();
    expect(clipboard[0]).toBe('mock final');
  });
});
