import { describe, expect, it } from 'vitest';
import { createCoalescedAsyncRunner } from '@susurrare/core';

describe('coalesced async runner', () => {
  it('coalesces overlapping calls into a single follow-up run', async () => {
    let runCount = 0;
    let releaseFirstRun: () => void = () => {};
    const firstRun = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });
    const runner = createCoalescedAsyncRunner(async () => {
      runCount += 1;
      if (runCount === 1) {
        await firstRun;
      }
    });

    const first = runner();
    const second = runner();
    const third = runner();

    expect(runCount).toBe(1);
    releaseFirstRun();

    await Promise.all([first, second, third]);

    expect(runCount).toBe(2);
  });

  it('runs again normally once the prior work is fully drained', async () => {
    let runCount = 0;
    const runner = createCoalescedAsyncRunner(async () => {
      runCount += 1;
    });

    await runner();
    await runner();

    expect(runCount).toBe(2);
  });
});
