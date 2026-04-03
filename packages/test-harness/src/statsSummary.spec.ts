import { describe, expect, it } from 'vitest';
import {
  buildStatsSummaryPromptInput,
  deriveStatsSummaryActivity,
  type StatsSummaryRequest,
} from '../../core/src';

const buildPayload = (mode: StatsSummaryRequest['mode']): StatsSummaryRequest => ({
  mode,
  series: [
    {
      id: 'averageSpeed',
      label: 'Average speed',
      unit: 'WPM',
      points: [
        { label: 'Older', value: 1194 },
        { label: 'Latest', value: 0 },
      ],
    },
    {
      id: 'wordsThisWeek',
      label: 'Words',
      unit: 'words',
      points: [
        { label: 'Older', value: 4800 },
        { label: 'Latest', value: 0 },
      ],
    },
    {
      id: 'appsUsed',
      label: 'Apps used',
      unit: 'apps',
      points: [
        { label: 'Older', value: 3 },
        { label: 'Latest', value: 0 },
      ],
    },
    {
      id: 'savedThisWeek',
      label: 'Saved time',
      unit: 'mins',
      points: [
        { label: 'Older', value: 32 },
        { label: 'Latest', value: 0 },
      ],
    },
  ],
});

describe('stats summary activity policy', () => {
  it('treats stale activity as inactive when the latest rolling window is zero', () => {
    const activity = deriveStatsSummaryActivity(buildPayload('rolling'));

    expect(activity.hasAnyActivity).toBe(true);
    expect(activity.hasLatestActivity).toBe(false);
    expect(activity.latestMetrics.averageSpeed).toBe(0);
    expect(activity.inactivityMessage).toContain('latest rolling 7-day window');
  });

  it('uses the calendar phrasing for weekly summaries', () => {
    const activity = deriveStatsSummaryActivity(buildPayload('calendar'));

    expect(activity.latestPeriodLabel).toBe('current calendar week');
    expect(activity.inactivityMessage).toContain('current calendar week');
  });

  it('includes latest-period metrics in the AI prompt input', () => {
    const input = buildStatsSummaryPromptInput(buildPayload('rolling'), 'Warm and upbeat.');

    expect(input.focusPeriod).toBe('latest rolling 7-day window');
    expect(input.latestMetrics).toEqual({
      averageSpeed: 0,
      wordsThisWeek: 0,
      appsUsed: 0,
      savedThisWeek: 0,
    });
    expect(input.styleHint).toBe('Warm and upbeat.');
  });
});
