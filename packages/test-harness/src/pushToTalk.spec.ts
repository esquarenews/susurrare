import { describe, expect, it } from 'vitest';
import { resolvePushToTalkReleaseDisposition } from '@susurrare/core';

describe('push-to-talk release policy', () => {
  it('cancels a pending start when the key is released before recording begins', () => {
    expect(
      resolvePushToTalkReleaseDisposition({
        holdStartPending: true,
        recordingActive: false,
        recordingStartInProgress: false,
      })
    ).toBe('cancel-pending-start');
  });

  it('debounces release while recording is active or still starting', () => {
    expect(
      resolvePushToTalkReleaseDisposition({
        holdStartPending: false,
        recordingActive: true,
        recordingStartInProgress: false,
      })
    ).toBe('debounce-release');
    expect(
      resolvePushToTalkReleaseDisposition({
        holdStartPending: false,
        recordingActive: false,
        recordingStartInProgress: true,
      })
    ).toBe('debounce-release');
  });

  it('ignores release events when nothing is pending or recording', () => {
    expect(
      resolvePushToTalkReleaseDisposition({
        holdStartPending: false,
        recordingActive: false,
        recordingStartInProgress: false,
      })
    ).toBe('ignore');
  });
});
