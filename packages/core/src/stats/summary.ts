import type { StatsSummaryRequest, StatsSummarySeries } from '../ipc';

type StatsMetricId = StatsSummarySeries['id'];

const STATS_METRIC_IDS: StatsMetricId[] = [
  'averageSpeed',
  'wordsThisWeek',
  'appsUsed',
  'savedThisWeek',
];

const normalizeMetricValue = (value: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

const getSeriesLatestValue = (series: StatsSummarySeries[], id: StatsMetricId) => {
  const points = series.find((entry) => entry.id === id)?.points;
  const latestPoint = points?.[points.length - 1];
  return normalizeMetricValue(latestPoint?.value ?? 0);
};

export const deriveStatsSummaryActivity = (payload: StatsSummaryRequest) => {
  const latestMetrics = {
    averageSpeed: getSeriesLatestValue(payload.series, 'averageSpeed'),
    wordsThisWeek: getSeriesLatestValue(payload.series, 'wordsThisWeek'),
    appsUsed: getSeriesLatestValue(payload.series, 'appsUsed'),
    savedThisWeek: getSeriesLatestValue(payload.series, 'savedThisWeek'),
  };
  const hasAnyActivity = payload.series.some((entry) =>
    entry.points.some((point) => normalizeMetricValue(point.value) > 0)
  );
  const hasLatestActivity = STATS_METRIC_IDS.some((id) => latestMetrics[id] > 0);
  const latestPeriodLabel =
    payload.mode === 'rolling' ? 'latest rolling 7-day window' : 'current calendar week';

  return {
    hasAnyActivity,
    hasLatestActivity,
    latestPeriodLabel,
    latestMetrics,
    inactivityMessage: hasAnyActivity
      ? `No activity in the ${latestPeriodLabel} yet. Record a few dictations to see current insights.`
      : 'No activity yet. Record a few dictations to unlock your weekly insights.',
  };
};

export const buildStatsSummaryPromptInput = (payload: StatsSummaryRequest, styleHint: string) => {
  const activity = deriveStatsSummaryActivity(payload);
  return {
    mode: payload.mode,
    focusPeriod: activity.latestPeriodLabel,
    latestMetrics: activity.latestMetrics,
    series: payload.series,
    styleHint,
  };
};
