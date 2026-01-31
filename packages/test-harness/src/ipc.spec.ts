import { describe, expect, it } from 'vitest';
import { IPC_VERSION, RecordingCommandSchema } from '@susurrare/core';

describe('ipc schemas', () => {
  it('validates recording commands', () => {
    expect(RecordingCommandSchema.parse('start')).toBe('start');
  });

  it('exposes version', () => {
    expect(IPC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
