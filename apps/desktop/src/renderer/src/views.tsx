import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  estimateSafeOpenAiTranscriptionDurationMs,
  formatDurationMinutesSeconds,
} from '@susurrare/core';
import type { HistoryItem, Mode, VocabularyEntry, Settings, ShortcutEntry } from '@susurrare/core';

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="stat-card">
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>
);

type StatusState = { text: string | null; nonce: number };

const StatusBanner: React.FC<{ status: StatusState }> = ({ status }) => {
  const message = status.text;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [message, status.nonce]);

  return (
    <div className="status-banner-slot">
      <div
        key={`${message ?? 'empty'}-${status.nonce}`}
        className={`status-banner${message ? '' : ' is-empty'}${visible ? '' : ' is-hidden'}`}
        aria-hidden={!message}
      >
        {message ?? '\u00A0'}
      </div>
    </div>
  );
};

const formatDayLabel = (timestamp: number) => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  const formatter =
    date.getFullYear() === today.getFullYear()
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return formatter.format(date);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text: string, query: string) => {
  const needle = query.trim();
  if (!needle) return text;
  const regex = new RegExp(`(${escapeRegExp(needle)})`, 'ig');
  return text.split(regex).map((part, index) => {
    if (part.toLowerCase() === needle.toLowerCase()) {
      return (
        <mark key={`${part}-${index}`} className="highlight">
          {part}
        </mark>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

const validateModelId = (value: string) => /^[a-z0-9._-]+$/i.test(value.trim());
const NON_STREAMING_SAMPLE_RATE_HZ = 16000;
const SHOW_DEV_MODE_HINTS =
  typeof window !== 'undefined' && window.location.protocol.startsWith('http');
const SAFE_NON_STREAMING_DURATION_LABEL = formatDurationMinutesSeconds(
  estimateSafeOpenAiTranscriptionDurationMs(NON_STREAMING_SAMPLE_RATE_HZ)
);

type HelpSectionId =
  | 'help-home-section'
  | 'help-modes'
  | 'help-vocabulary'
  | 'help-shortcuts'
  | 'help-configuration'
  | 'help-sound'
  | 'help-models'
  | 'help-history'
  | 'help-diagnostics';

const ViewTitle: React.FC<{
  title: string;
  sectionId: HelpSectionId;
  ariaLabel: string;
}> = ({ title, sectionId, ariaLabel }) => (
  <h2 className="view-title">
    <span className="view-title-main">
      {title}
      <button
        type="button"
        className="view-help-link"
        aria-label={ariaLabel}
        title="Open help"
        onClick={() => void window.susurrare.help.open(sectionId)}
      >
        ?
      </button>
    </span>
  </h2>
);

const SettingsConfigView: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<StatusState>({ text: null, nonce: 0 });
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    window.susurrare.settings.get().then(setSettings).catch(console.error);
  }, []);

  if (!settings) {
    return (
      <div className="view">
        <div className="view-header">
          <div>
            <ViewTitle
              title="Configuration"
              sectionId="help-configuration"
              ariaLabel="Open Configuration help section"
            />
            <p>App preferences, shortcuts, updates, and API access.</p>
          </div>
        </div>
        <div className="card empty-state">
          <h4>Loading settings</h4>
          <p>Please wait...</p>
        </div>
      </div>
    );
  }

  const update = async (partial: Partial<Settings>) => {
    try {
      const next = await window.susurrare.settings.set(partial);
      setSettings(next);
      if (partial.theme) {
        const root = document.documentElement;
        if (partial.theme === 'system') {
          root.removeAttribute('data-theme');
        } else {
          root.setAttribute('data-theme', partial.theme);
        }
      }
      setStatus({ text: 'Settings updated.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setStatus({ text: 'Unable to save settings.', nonce: Date.now() });
    }
  };

  const saveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    await update({ openAiApiKey: trimmed });
    setApiKeyInput('');
  };

  const clearApiKey = async () => {
    await update({ openAiApiKey: undefined });
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle
            title="Configuration"
            sectionId="help-configuration"
            ariaLabel="Open Configuration help section"
          />
          <p>App preferences, shortcuts, updates, and API access.</p>
        </div>
      </div>
      <StatusBanner status={status} />
      <div className="card">
        <h3>Appearance</h3>
        <div className="toggle-row">
          <div>Theme</div>
          <div className="segmented">
            {(['light', 'dark', 'system'] as const).map((value) => (
              <button
                key={value}
                className={settings.theme === value ? 'selected' : ''}
                onClick={() => update({ theme: value })}
              >
                {value === 'system' ? 'System' : value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Recording window</h3>
        <div className="toggle-row">
          <div>Style</div>
          <div className="segmented">
            {(['show', 'hide'] as const).map((style) => (
              <button
                key={style}
                className={settings.overlayStyle === style ? 'selected' : ''}
                onClick={() => update({ overlayStyle: style })}
              >
                {style === 'show' ? 'Show' : 'Hide'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Recording</h3>
        <div className="toggle-row">
          <div>Time out duration</div>
          <select
            value={settings.recordingTimeoutMs}
            onChange={(event) => update({ recordingTimeoutMs: Number(event.target.value) })}
          >
            <option value={60000}>1 minute</option>
            <option value={300000}>5 minutes</option>
            <option value={600000}>10 minutes</option>
            <option value={1800000}>30 minutes</option>
          </select>
        </div>
      </div>
      <div className="card">
        <h3>Transcription</h3>
        <div className="toggle-row">
          <div>Language</div>
          <select
            value={settings.transcriptionLanguage}
            onChange={(event) => update({ transcriptionLanguage: event.target.value })}
          >
            <option value="en">English</option>
            <option value="auto">Auto-detect</option>
          </select>
        </div>
        <div className="toggle-row">
          <div>Restore clipboard after paste</div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.restoreClipboardAfterPaste}
              onChange={(event) => update({ restoreClipboardAfterPaste: event.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </div>
      <div className="card">
        <h3>Keyboard shortcuts</h3>
        <div className="shortcut-row">
          <div>
            <strong>Change mode</strong>
            <p>Cycle or open the mode switcher.</p>
          </div>
          <input
            className="keycap-input"
            value={settings.changeModeShortcut}
            onChange={(event) => update({ changeModeShortcut: event.target.value })}
          />
        </div>
        <div className="shortcut-row">
          <div>
            <strong>Cancel Recording</strong>
            <p>Discards the active recording.</p>
          </div>
          <input
            className="keycap-input"
            value={settings.cancelKey}
            onChange={(event) => update({ cancelKey: event.target.value })}
          />
        </div>
        <div className="shortcut-row">
          <div>
            <strong>Push to Talk</strong>
            <p>Hold to record, release to paste.</p>
          </div>
          <input
            className="keycap-input"
            value={settings.pushToTalkKey}
            onChange={(event) => update({ pushToTalkKey: event.target.value })}
          />
        </div>
        <div className="shortcut-row">
          <div>
            <strong>Toggle Recording</strong>
            <p>Press once to start or stop recording.</p>
          </div>
          <input
            className="keycap-input"
            value={settings.toggleRecordingKey}
            onChange={(event) => update({ toggleRecordingKey: event.target.value })}
          />
        </div>
      </div>
      <div className="card">
        <h3>Application</h3>
        <div className="toggle-row">
          <div>Check for updates</div>
          <button
            className="chip"
            onClick={async () => {
              const result = await window.susurrare.updates.check();
              setStatus({
                text:
                  result.status === 'checked'
                    ? 'Update check complete.'
                    : `Update check failed: ${result.message ?? 'unknown error'}`,
                nonce: Date.now(),
              });
            }}
          >
            Check for updates...
          </button>
        </div>
        <div className="toggle-row">
          <div>Automatically check for updates</div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.updateChecks}
              onChange={(event) => update({ updateChecks: event.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="toggle-row">
          <div>Launch on login</div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.launchOnLogin}
              onChange={(event) => update({ launchOnLogin: event.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </div>
      <div className="card">
        <h3>OpenAI API key</h3>
        <p className="muted">Stored locally on this machine. It will be hidden after saving.</p>
        <div className="config-row">
          <input
            className="keycap-input field-wide"
            type="password"
            placeholder={settings.openAiApiKey ? 'Saved (hidden)' : 'sk-...'}
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
          />
          <button className="chip" onClick={saveApiKey} disabled={!apiKeyInput.trim()}>
            Save key
          </button>
          <button className="chip danger" onClick={clearApiKey} disabled={!settings.openAiApiKey}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

const SoundConfigView: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<StatusState>({ text: null, nonce: 0 });

  useEffect(() => {
    window.susurrare.settings.get().then(setSettings).catch(console.error);
  }, []);

  if (!settings) {
    return (
      <div className="view">
        <div className="view-header">
          <div>
            <ViewTitle title="Sound" sectionId="help-sound" ariaLabel="Open Sound help section" />
            <p>Microphone behavior and feedback audio.</p>
          </div>
        </div>
        <div className="card empty-state">
          <h4>Loading sound settings</h4>
          <p>Please wait...</p>
        </div>
      </div>
    );
  }

  const update = async (partial: Partial<Settings>) => {
    try {
      const next = await window.susurrare.settings.set(partial);
      setSettings(next);
      setStatus({ text: 'Sound settings updated.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setStatus({ text: 'Unable to save sound settings.', nonce: Date.now() });
    }
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle title="Sound" sectionId="help-sound" ariaLabel="Open Sound help section" />
          <p>Microphone behavior and feedback audio.</p>
        </div>
      </div>
      <StatusBanner status={status} />
      <div className="card">
        <h3>Microphone</h3>
        <div className="toggle-row">
          <div>Automatically increase microphone volume</div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.autoGain}
              onChange={(event) => update({ autoGain: event.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="toggle-row">
          <div>Silence removal</div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.silenceRemoval}
              onChange={(event) => update({ silenceRemoval: event.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </div>
      <div className="card">
        <h3>Sound effects</h3>
        <div className="toggle-row">
          <div>Enable sound effects</div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.soundEffects}
              onChange={(event) => update({ soundEffects: event.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="slider-row">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.soundEffectsVolume}
            onChange={(event) => update({ soundEffectsVolume: Number(event.target.value) })}
          />
        </div>
      </div>
    </div>
  );
};

const ModelsLibraryView: React.FC = () => {
  const [models, setModels] = useState<Array<{ id: string; name: string; speed: string }>>([]);
  const [pinned, setPinned] = useState('');
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    window.susurrare.models
      .list()
      .then(setModels)
      .catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    if (!pinned.trim()) {
      setWarning(null);
      return;
    }
    setWarning(validateModelId(pinned) ? null : 'Model id must be letters, numbers, ., _, or -');
  }, [pinned]);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle
            title="Models Library"
            sectionId="help-models"
            ariaLabel="Open Models Library help section"
          />
          <p>Pick models tuned for speed, accuracy, or meeting diarization.</p>
        </div>
        <button className="primary" onClick={() => window.location.reload()}>
          Refresh models
        </button>
      </div>
      <div className="card-grid">
        {models.map((model) => (
          <div key={model.id} className="model-card">
            <div className="model-tag">
              {model.id.includes('diarize')
                ? 'Meetings'
                : model.speed === 'fast'
                ? 'Fast'
                : model.speed === 'accurate'
                ? 'Accurate'
                : 'Balanced'}
            </div>
            <h3>{model.name}</h3>
            <p>{model.id}</p>
            {model.speed === 'fast' && <span className="tag">Recommended default</span>}
            {model.id.includes('diarize') && (
              <span className="tag">Best for multi-speaker notes</span>
            )}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Pinned model</h3>
        <p className="muted">Use a custom model id for advanced setups.</p>
        <input
          className={`search ${warning ? 'input-warning' : ''}`}
          placeholder="gpt-4o-mini-transcribe"
          value={pinned}
          onChange={(event) => setPinned(event.target.value)}
        />
        {warning && <div className="warning-text">{warning}</div>}
      </div>
    </div>
  );
};

type HomeStats = {
  averageSpeed: string;
  wordsThisWeek: string;
  appsUsed: string;
  savedThisWeek: string;
};

type StatsMode = 'rolling' | 'calendar';

type StatsPoint = { label: string; value: number };

type StatsSeries = {
  id: 'averageSpeed' | 'wordsThisWeek' | 'appsUsed' | 'savedThisWeek';
  label: string;
  unit: string;
  points: StatsPoint[];
};

type DotStyle = React.CSSProperties & {
  ['--dot-index']?: string;
  ['--dot-x']?: string;
  ['--dot-y']?: string;
  ['--dot-size']?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const startOfWeek = (timestamp: number) => {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
  return start.getTime();
};

const summarizeRange = (items: HistoryItem[], rangeStart: number, rangeEnd: number) => {
  const rangeItems = items.filter(
    (item) => item.createdAt >= rangeStart && item.createdAt < rangeEnd && item.status === 'success'
  );
  const wordCounts = rangeItems.map((item) => item.wordCount ?? countWords(item.text));
  const words = wordCounts.reduce((total, count) => total + count, 0);
  const speedSamples = rangeItems
    .map((item, index) => ({
      words: wordCounts[index],
      durationMs: item.audioDurationMs ?? 0,
    }))
    .filter((sample) => sample.words > 0 && sample.durationMs > 0);
  const averageSpeed = speedSamples.length
    ? speedSamples.reduce((total, sample) => total + sample.words / (sample.durationMs / 60000), 0) /
      speedSamples.length
    : 0;
  const totalDurationMs = rangeItems.reduce((total, item, index) => {
    if (item.audioDurationMs) return total + item.audioDurationMs;
    const wordsInItem = wordCounts[index];
    if (!wordsInItem) return total;
    return total + (wordsInItem / 150) * 60000;
  }, 0);
  const savedMinutes = totalDurationMs / 60000;
  const appNames = rangeItems
    .map((item) => item.appName)
    .filter((appName): appName is string => !!appName);
  const appsUsed = appNames.length ? new Set(appNames).size : 0;
  return { averageSpeed, words, appsUsed, savedMinutes };
};

const buildSeries = (items: HistoryItem[], mode: StatsMode): StatsSeries[] => {
  const now = Date.now();
  const endDay = startOfDay(now);
  const points: Array<{ label: string; summary: ReturnType<typeof summarizeRange> }> = [];
  if (mode === 'rolling') {
    const days = 28;
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const dayEnd = endDay - offset * DAY_MS;
      const rangeStart = dayEnd - 6 * DAY_MS;
      const rangeEnd = dayEnd + DAY_MS;
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(dayEnd);
      points.push({ label, summary: summarizeRange(items, rangeStart, rangeEnd) });
    }
  } else {
    const weeks = 8;
    const currentWeekStart = startOfWeek(endDay);
    for (let offset = weeks - 1; offset >= 0; offset -= 1) {
      const weekStart = currentWeekStart - offset * 7 * DAY_MS;
      const rangeStart = weekStart;
      const rangeEnd = weekStart + 7 * DAY_MS;
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(weekStart);
      points.push({ label, summary: summarizeRange(items, rangeStart, rangeEnd) });
    }
  }

  return [
    {
      id: 'averageSpeed',
      label: 'Average speed',
      unit: 'WPM',
      points: points.map((point) => ({ label: point.label, value: point.summary.averageSpeed })),
    },
    {
      id: 'wordsThisWeek',
      label: 'Words',
      unit: 'words',
      points: points.map((point) => ({ label: point.label, value: point.summary.words })),
    },
    {
      id: 'appsUsed',
      label: 'Apps used',
      unit: 'apps',
      points: points.map((point) => ({ label: point.label, value: point.summary.appsUsed })),
    },
    {
      id: 'savedThisWeek',
      label: 'Saved time',
      unit: 'mins',
      points: points.map((point) => ({ label: point.label, value: point.summary.savedMinutes })),
    },
  ];
};

const LineChart: React.FC<{
  points: StatsPoint[];
  formatValue?: (value: number) => string;
}> = ({ points, formatValue }) => {
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    label: string;
    value: string;
  } | null>(null);
  const width = 260;
  const height = 120;
  const padding = 12;
  const values = points.map((point) => point.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const x = padding + index * step;
    const normalized = (point.value - min) / range;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y };
  });
  const path = coords.map((point) => `${point.x},${point.y}`).join(' ');
  return (
    <div className="stats-chart-wrapper">
      <svg
        className="stats-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          if (!points.length) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const relativeX = event.clientX - rect.left;
          const index = Math.max(
            0,
            Math.min(points.length - 1, Math.round((relativeX - padding) / step))
          );
          const point = coords[index];
          if (!point) return;
          const value = points[index]?.value ?? 0;
          const formatted = formatValue ? formatValue(value) : formatNumber(value);
          setHover({
            x: point.x,
            y: point.y,
            label: points[index]?.label ?? '',
            value: formatted,
          });
        }}
      >
        <polyline points={path} />
        {coords.map((point, index) => (
          <circle key={index} className="stats-line-hit" cx={point.x} cy={point.y} r="8" />
        ))}
      </svg>
      {hover && (
        <div
          className="stats-tooltip"
          style={{ left: `${hover.x}px`, top: `${hover.y}px` }}
        >
          <span>{hover.label}</span>
          <strong>{hover.value}</strong>
        </div>
      )}
    </div>
  );
};

const buildPerformanceSummary = (series: StatsSeries[]) => {
  const getSeries = (id: StatsSeries['id']) => series.find((item) => item.id === id);
  const summarize = (points: StatsPoint[]) => {
    if (!points.length) return { last: 0, previous: 0, delta: 0 };
    const last = points[points.length - 1]?.value ?? 0;
    const previous = points.length > 1 ? points[points.length - 2]?.value ?? 0 : last;
    return { last, previous, delta: last - previous };
  };

  const speed = summarize(getSeries('averageSpeed')?.points ?? []);
  const words = summarize(getSeries('wordsThisWeek')?.points ?? []);
  const apps = summarize(getSeries('appsUsed')?.points ?? []);
  const saved = summarize(getSeries('savedThisWeek')?.points ?? []);

  if (!speed.last && !words.last && !saved.last) {
    return 'No activity yet. Record a few dictations to unlock your weekly insights.';
  }

  const speedText = speed.last
    ? `${Math.round(speed.last)} WPM`
    : 'a steady pace';
  const savedText = saved.last ? `${Math.round(saved.last)} minutes` : 'some time';
  const wordTrend = words.delta >= 0 ? 'up' : 'down';
  const appTrend = apps.last > 1 ? `across ${Math.round(apps.last)} apps` : 'in one app';

  const nudge =
    words.delta < 0
      ? 'Try one extra short dictation to keep momentum.'
      : saved.delta < 0
      ? 'A slightly longer session could boost your time savings.'
      : 'Keep it up and challenge yourself to beat this week’s word count.';

  return `Nice work — you averaged ${speedText} and saved ${savedText} ${appTrend}. Your word count is ${wordTrend} versus the prior period. ${nudge}`;
};

const createThinkingDots = (count: number) => {
  let seed = 1337;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: count }).map((_, index) => {
    const x = 12 + next() * 160;
    const y = 12 + next() * 52;
    const size = 4 + next() * 3;
    return {
      id: `dot-${index}`,
      x: Math.round(x),
      y: Math.round(y),
      size: Number(size.toFixed(1)),
    };
  });
};

export const HomeView: React.FC<{ stats: HomeStats; historyItems: HistoryItem[] }> = ({
  stats,
  historyItems,
}) => {
  const [showTrends, setShowTrends] = useState(false);
  const [statsMode, setStatsMode] = useState<StatsMode>('rolling');
  const series = useMemo(() => buildSeries(historyItems, statsMode), [historyItems, statsMode]);
  const thinkingDots = useMemo(() => createThinkingDots(26), []);
  const [summaryState, setSummaryState] = useState<{
    text: string;
    source: 'openai' | 'unavailable' | 'error' | 'loading';
  }>({ text: 'Generating summary…', source: 'loading' });
  const summaryKeyRef = useRef('');

  useEffect(() => {
    if (!showTrends) {
      summaryKeyRef.current = '';
      return;
    }
    const hasActivity = series.some((metric) =>
      metric.points.some((point) => point.value > 0)
    );
    if (!hasActivity) {
      setSummaryState({
        text: 'No activity yet. Record a few dictations to unlock your weekly insights.',
        source: 'unavailable',
      });
      return;
    }
    const trimmedSeries = series.map((metric) => ({
      ...metric,
      points: metric.points.slice(-8),
    }));
    const payload = { mode: statsMode, series: trimmedSeries };
    const key = JSON.stringify(payload);
    if (summaryKeyRef.current === key) return;
    summaryKeyRef.current = key;
    setSummaryState({ text: 'Generating summary…', source: 'loading' });
    window.susurrare.stats
      .summary(payload)
      .then((result) => {
        if (result.summary) {
          setSummaryState({ text: result.summary, source: result.source });
          return;
        }
        if (result.source === 'unavailable') {
          setSummaryState({
            text: 'Add your OpenAI API key in Configuration to enable AI summaries.',
            source: 'unavailable',
          });
          return;
        }
        setSummaryState({
          text: buildPerformanceSummary(series),
          source: 'error',
        });
      })
      .catch(() => {
        setSummaryState({
          text: buildPerformanceSummary(series),
          source: 'error',
        });
      });
  }, [showTrends, series, statsMode]);

  const summaryTag =
    summaryState.source === 'openai'
      ? 'AI coach'
      : summaryState.source === 'loading'
      ? 'Generating'
      : 'Info';
  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle title="Home" sectionId="help-home-section" ariaLabel="Open Home help section" />
          <p>Your dictation activity snapshot and quick-start actions.</p>
        </div>
        <div className="view-header-actions">
          <button className="chip stats-trends-button" onClick={() => setShowTrends(true)}>
            View my stats
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard label="Average speed" value={stats.averageSpeed} />
        <StatCard label="Words this week" value={stats.wordsThisWeek} />
        <StatCard label="Apps used" value={stats.appsUsed} />
        <StatCard label="Saved this week" value={stats.savedThisWeek} />
      </div>
      {showTrends && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-window stats-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h2>Weekly Stats</h2>
                <p className="muted">Compare your usage over time.</p>
              </div>
              <div className="modal-actions">
                <div className="segmented">
                  <button
                    className={statsMode === 'rolling' ? 'active' : ''}
                    onClick={() => setStatsMode('rolling')}
                  >
                    Rolling 7 days
                  </button>
                  <button
                    className={statsMode === 'calendar' ? 'active' : ''}
                    onClick={() => setStatsMode('calendar')}
                  >
                    Mon-Sun
                  </button>
                </div>
                <button className="chip" onClick={() => setShowTrends(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="stats-chart-grid">
              <div className="stats-chart-card stats-summary-card">
                <div className="stats-chart-header">
                  <h3>Susurrare Bot</h3>
                  <span className="tag">{summaryTag}</span>
                </div>
                {summaryState.source === 'loading' ? (
                  <div className="stats-thinking" aria-label="AI thinking">
                    <div className="thinking-cloud">
                      {thinkingDots.map((dot, index) => (
                        <span
                          key={dot.id}
                          style={{
                            '--dot-index': `${index}`,
                            '--dot-x': `${dot.x}px`,
                            '--dot-y': `${dot.y}px`,
                            '--dot-size': `${dot.size}px`,
                          } as DotStyle}
                        />
                      ))}
                    </div>
                    <span className="thinking-label">Thinking…</span>
                  </div>
                ) : (
                  <p className="stats-summary-text">{summaryState.text}</p>
                )}
              </div>
              {series.map((metric) => {
                const latest = metric.points[metric.points.length - 1]?.value ?? 0;
                const displayValue =
                  metric.id === 'averageSpeed'
                    ? `${Math.round(latest)} ${metric.unit}`
                    : metric.id === 'savedThisWeek'
                    ? `${Math.round(latest)} ${metric.unit}`
                    : `${formatNumber(latest)} ${metric.unit}`;
                const firstLabel = metric.points[0]?.label ?? '';
                const lastLabel = metric.points[metric.points.length - 1]?.label ?? '';
                return (
                  <div key={metric.id} className="stats-chart-card">
                    <div className="stats-chart-header">
                      <h3>{metric.label}</h3>
                      <span className="stats-chart-value">{displayValue}</span>
                    </div>
                    <LineChart
                      points={metric.points}
                      formatValue={(value) => {
                        if (metric.id === 'averageSpeed') {
                          return `${Math.round(value)} ${metric.unit}`;
                        }
                        if (metric.id === 'savedThisWeek') {
                          return `${Math.round(value)} ${metric.unit}`;
                        }
                        return `${formatNumber(value)} ${metric.unit}`;
                      }}
                    />
                    <div className="stats-chart-axis">
                      <span>{firstLabel}</span>
                      <span>{lastLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <h2>Get started</h2>
        <div className="action-list">
          <div>
            <h3>Start recording</h3>
            <p>Hold F15 to dictate, release to paste.</p>
          </div>
          <div>
            <h3>Customize shortcuts</h3>
            <p>Set your push-to-talk and cancel keys.</p>
          </div>
          <div>
            <h3>Create a mode</h3>
            <p>Tailor profiles for meetings, writing, or coding.</p>
          </div>
          <div>
            <h3>Add vocabulary</h3>
            <p>Teach Susurrare names, acronyms, and jargon.</p>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>What&apos;s new</h2>
        <div className="news-item">
          <span className="tag">Jan 22</span>
          <div>
            <h3>Realtime GPT transcription</h3>
            <p>Try the newest low-latency model with live streaming.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ModesView: React.FC = () => {
  const [modes, setModes] = useState<Mode[]>([]);
  const [activeModeId, setActiveModeId] = useState('default');
  const [modeStatus, setModeStatus] = useState<StatusState>({ text: null, nonce: 0 });
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const [editingModeId, setEditingModeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const autosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [modeList, settings] = await Promise.all([
          window.susurrare.modes.list(),
          window.susurrare.settings.get(),
        ]);
        setModes(modeList);
        setActiveModeId(settings.activeModeId);
        if (!modeList.length) {
          setModeStatus({
            text: 'No modes found yet. Create your first mode to get started.',
            nonce: Date.now(),
          });
        }
      } catch (error) {
        console.error(error);
        setModeStatus({
          text: 'Unable to load modes. Check the main process bridge.',
          nonce: Date.now(),
        });
      }
    };
    load();
  }, []);

  useEffect(() => {
    const timers = autosaveTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    setEditingModeId(null);
    setEditingName('');
  }, [selectedModeId]);

  const scheduleModeSave = (mode: Mode) => {
    if (autosaveTimers.current[mode.id]) {
      clearTimeout(autosaveTimers.current[mode.id]);
    }
    autosaveTimers.current[mode.id] = setTimeout(() => {
      void saveMode(mode);
    }, 400);
  };

  const updateMode = (id: string, patch: Partial<Mode>) => {
    setModes((prev) => {
      let updated: Mode | null = null;
      const next = prev.map((mode) => {
        if (mode.id !== id) return mode;
        const merged = { ...mode, ...patch, updatedAt: Date.now() };
        updated = merged;
        return merged;
      });
      if (updated) scheduleModeSave(updated);
      return next;
    });
  };

  const isPinnedValid = (mode: Mode) =>
    mode.model.selection !== 'pinned' ||
    (mode.model.pinnedModelId ? validateModelId(mode.model.pinnedModelId) : false);

  const saveMode = async (mode: Mode) => {
    try {
      if (!isPinnedValid(mode)) {
        setModeStatus({ text: 'Pinned model id is invalid.', nonce: Date.now() });
        return;
      }
      const saved = await window.susurrare.modes.save({
        ...mode,
        updatedAt: Date.now(),
      });
      setModes((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setModeStatus({ text: 'Mode saved.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setModeStatus({ text: 'Unable to save mode.', nonce: Date.now() });
    }
  };

  const renameMode = async (mode: Mode, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === mode.name) return;
    await saveMode({ ...mode, name: trimmed });
  };

  const createMode = async () => {
    const now = Date.now();
    const newMode: Mode = {
      id: `mode-${now}`,
      name: 'New mode',
      description: '',
      model: { selection: 'fast' },
      streamingEnabled: true,
      punctuationNormalization: true,
      punctuationCommandsEnabled: false,
      shortcutsEnabled: false,
      formattingEnabled: false,
      formattingStyle: 'plain',
      insertionBehavior: 'insert',
      vocabularySetIds: ['global', 'mode'],
      createdAt: now,
      updatedAt: now,
    };
    try {
      const saved = await window.susurrare.modes.save(newMode);
      setModes((prev) => [saved, ...prev]);
      setModeStatus({ text: 'Mode created.', nonce: Date.now() });
      setSelectedModeId(saved.id);
    } catch (error) {
      console.error(error);
      setModes((prev) => [newMode, ...prev]);
      setModeStatus({ text: 'Mode created locally (save failed).', nonce: Date.now() });
      setSelectedModeId(newMode.id);
    }
  };

  const removeMode = async (id: string) => {
    if (id === 'default') return;
    try {
      await window.susurrare.modes.remove(id);
      setModes((prev) => prev.filter((mode) => mode.id !== id));
      setModeStatus({ text: 'Mode deleted.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setModeStatus({ text: 'Unable to delete mode.', nonce: Date.now() });
    }
  };

  const setActiveMode = async (id: string) => {
    try {
      const settings = await window.susurrare.settings.set({ activeModeId: id });
      setActiveModeId(settings.activeModeId);
      setModeStatus({ text: 'Active mode updated.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setModeStatus({ text: 'Unable to change active mode.', nonce: Date.now() });
    }
  };

  const selectedMode = selectedModeId ? modes.find((mode) => mode.id === selectedModeId) : null;
  if (selectedModeId && !selectedMode && modes.length) {
    setSelectedModeId(null);
  }

  const modelLabel = (mode: Mode) => {
    if (mode.model.selection === 'fast') return 'Fast';
    if (mode.model.selection === 'accurate') return 'Accurate';
    if (mode.model.selection === 'meeting') return 'Meetings';
    if (mode.model.selection === 'pinned') return 'Pinned';
    return 'Custom';
  };

  if (!selectedMode) {
    return (
      <div className="view">
        <div className="view-header">
          <div>
            <ViewTitle title="Modes" sectionId="help-modes" ariaLabel="Open Modes help section" />
            <p>Create modes designed for your tasks, from messaging to meetings.</p>
          </div>
          <button className="primary" onClick={createMode}>
            New mode
          </button>
        </div>
        <StatusBanner status={modeStatus} />
        {modes.length === 0 ? (
          <div className="card empty-state">
            <h4>No modes yet</h4>
            <p>Create a mode to customize model, streaming, and insertion behavior.</p>
          </div>
        ) : (
          <div className="mode-list-summary">
            {modes.map((mode) => (
              <div
                key={mode.id}
                className="mode-list-item"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedModeId(mode.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedModeId(mode.id);
                  }
                }}
              >
                <div className="mode-link">
                  <h3>{mode.name}</h3>
                  <span className="mode-meta">
                    {modelLabel(mode)} · {mode.streamingEnabled ? 'Streaming on' : 'Streaming off'}
                  </span>
                </div>
                <div className="mode-list-actions">
                  {activeModeId === mode.id ? (
                    <span className="tag">Active</span>
                  ) : (
                    <button
                      className="chip"
                      onClick={(event) => {
                        event.stopPropagation();
                        void setActiveMode(mode.id);
                      }}
                    >
                      Make active
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <button className="chip" onClick={() => setSelectedModeId(null)}>
            ← All modes
          </button>
          <ViewTitle
            title={selectedMode.name}
            sectionId="help-modes"
            ariaLabel="Open Modes help section"
          />
          <p>Adjust model, streaming, and vocabulary settings for this mode.</p>
        </div>
        <div className="mode-header-actions">
          {activeModeId === selectedMode.id ? (
            <span className="tag">Active</span>
          ) : (
            <button className="chip" onClick={() => setActiveMode(selectedMode.id)}>
              Set active
            </button>
          )}
        </div>
      </div>
      <StatusBanner status={modeStatus} />
      {(() => {
        const mode = selectedMode;
        const scope = mode.vocabularySetIds ?? ['global', 'mode'];
        const toggleScope = (value: 'global' | 'mode') => {
          const next = scope.includes(value)
            ? scope.filter((item) => item !== value)
            : [...scope, value];
          updateMode(mode.id, { vocabularySetIds: next });
        };
        return (
          <div className="mode-card">
            <div className="mode-header">
              {editingModeId === mode.id ? (
                <div className="mode-rename">
                  <input
                    className="mode-name-input"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        renameMode(mode, editingName);
                        setEditingModeId(null);
                      }
                      if (event.key === 'Escape') {
                        setEditingModeId(null);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    className="chip"
                    onClick={() => {
                      renameMode(mode, editingName);
                      setEditingModeId(null);
                    }}
                  >
                    Save
                  </button>
                  <button className="chip" onClick={() => setEditingModeId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mode-title">
                  <h3>{mode.name}</h3>
                  <button
                    className="chip"
                    onClick={() => {
                      setEditingModeId(mode.id);
                      setEditingName(mode.name);
                    }}
                  >
                    Rename
                  </button>
                </div>
              )}
            </div>
            <div className="mode-grid mode-grid-aligned">
              <div className="mode-column">
                <div className="mode-row row-model row-left">
                  <label className="mode-field">
                    Model
                    <select
                      value={mode.model.selection}
                      onChange={(event) =>
                        updateMode(mode.id, {
                          model: {
                            ...mode.model,
                            selection: event.target.value as Mode['model']['selection'],
                          },
                        })
                      }
                    >
                      <option value="fast">Fast</option>
                      <option value="meeting">Meetings (Diarize)</option>
                      <option value="accurate">Accurate</option>
                      <option value="pinned">Pinned</option>
                    </select>
                  </label>
                  {mode.model.selection === 'pinned' && (
                    <label className="mode-field">
                      Pinned model ID
                      <input
                        value={mode.model.pinnedModelId ?? ''}
                        onChange={(event) =>
                          updateMode(mode.id, {
                            model: { ...mode.model, pinnedModelId: event.target.value },
                          })
                        }
                        placeholder="gpt-stt-realtime"
                      />
                      {!isPinnedValid(mode) && (
                        <div className="warning-text">Enter a valid model id.</div>
                      )}
                    </label>
                  )}
                </div>
                <div className="mode-row row-insertion row-left">
                  <label className="mode-field">
                    Insertion
                    <select
                      value={mode.insertionBehavior}
                      onChange={(event) =>
                        updateMode(mode.id, {
                          insertionBehavior: event.target.value as Mode['insertionBehavior'],
                        })
                      }
                    >
                      <option value="insert">Insert at cursor</option>
                      <option value="clipboard">Clipboard only</option>
                    </select>
                  </label>
                </div>
                <div className="mode-row row-prompt row-left">
                  <label className="mode-field">
                    Additional Prompt
                    <textarea
                      className="mode-textarea"
                      rows={3}
                      value={mode.rewritePrompt ?? ''}
                      onChange={(event) =>
                        updateMode(mode.id, { rewritePrompt: event.target.value })
                      }
                      placeholder="e.g. Make this ALL CAPS. Remove filler words."
                    />
                    <span className="muted">Applied after transcription before insert/paste.</span>
                  </label>
                </div>
                <div className="mode-row row-format row-left">
                  <label className="mode-field">
                    Output style
                    <select
                      value={mode.formattingStyle ?? 'plain'}
                      onChange={(event) =>
                        updateMode(mode.id, {
                          formattingStyle: event.target.value as Mode['formattingStyle'],
                        })
                      }
                      disabled={!mode.formattingEnabled}
                    >
                      <option value="plain">Plain text</option>
                      <option value="markdown">Markdown</option>
                      <option value="slack">Slack markup</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="mode-column mode-column-compact">
                <div className="mode-row row-model row-right">
                  <label className="inline-toggle">
                    <span>Streaming</span>
                    <input
                      type="checkbox"
                      checked={mode.streamingEnabled}
                      onChange={(event) =>
                        updateMode(mode.id, { streamingEnabled: event.target.checked })
                      }
                    />
                  </label>
                  {SHOW_DEV_MODE_HINTS && (
                    <p className="mode-dev-hint">
                      {mode.streamingEnabled
                        ? `Dev hint: streaming is on. If disabled, non-streaming auto-stop targets ${SAFE_NON_STREAMING_DURATION_LABEL}.`
                        : `Dev hint: non-streaming auto-stop targets ${SAFE_NON_STREAMING_DURATION_LABEL} to avoid upload-size failures.`}
                    </p>
                  )}
                </div>
                <div className="mode-row row-insertion row-right">
                  <label className="inline-toggle">
                    <span>Punctuation</span>
                    <input
                      type="checkbox"
                      checked={mode.punctuationNormalization ?? true}
                      onChange={(event) =>
                        updateMode(mode.id, { punctuationNormalization: event.target.checked })
                      }
                    />
                  </label>
                </div>
                <div className="mode-row row-prompt row-right scope-toggle">
                  <span>Vocabulary set</span>
                  <div className="scope-options">
                    <label>
                      <span>&nbsp;&nbsp;Global</span>
                      <input
                        type="checkbox"
                        checked={scope.includes('global')}
                        onChange={() => toggleScope('global')}
                      />
                    </label>
                    <label>
                      <span>&nbsp;&nbsp;Mode-specific</span>
                      <input
                        type="checkbox"
                        checked={scope.includes('mode')}
                        onChange={() => toggleScope('mode')}
                      />
                    </label>
                  </div>
                </div>
                <div className="mode-row row-format row-right">
                  <div className="formatting-toggles">
                    <label className="inline-toggle">
                      <span>Shortcuts</span>
                      <input
                        type="checkbox"
                        checked={mode.shortcutsEnabled ?? false}
                        onChange={(event) =>
                          updateMode(mode.id, { shortcutsEnabled: event.target.checked })
                        }
                      />
                    </label>
                    <label className="inline-toggle">
                      <span>Punctuation commands</span>
                      <input
                        type="checkbox"
                        checked={mode.punctuationCommandsEnabled ?? false}
                        onChange={(event) =>
                          updateMode(mode.id, {
                            punctuationCommandsEnabled: event.target.checked,
                          })
                        }
                      />
                    </label>
                    <label className="inline-toggle">
                      <span>Formatting commands</span>
                      <input
                        type="checkbox"
                        checked={mode.formattingEnabled ?? false}
                        onChange={(event) =>
                          updateMode(mode.id, { formattingEnabled: event.target.checked })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="mode-actions">
              <button className="chip" onClick={() => saveMode(mode)} disabled={!isPinnedValid(mode)}>
                Save
              </button>
              <button
                className="chip danger"
                onClick={() => removeMode(mode.id)}
                disabled={mode.id === 'default'}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export const VocabularyView: React.FC = () => {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [modes, setModes] = useState<Mode[]>([]);
  const [form, setForm] = useState({ source: '', replacement: '', scope: 'global', modeId: '' });

  useEffect(() => {
    const load = async () => {
      const [entryList, modeList] = await Promise.all([
        window.susurrare.vocabulary.list(),
        window.susurrare.modes.list(),
      ]);
      setEntries(entryList);
      setModes(modeList);
    };
    load();
  }, []);

  const addEntry = async () => {
    if (!form.source.trim()) return;
    const now = Date.now();
    const entry: VocabularyEntry = {
      id: `vocab-${now}`,
      source: form.source.trim(),
      replacement: form.replacement.trim(),
      createdAt: now,
      updatedAt: now,
      modeId: form.scope === 'mode' ? form.modeId || undefined : undefined,
    };
    const saved = await window.susurrare.vocabulary.save(entry);
    setEntries((prev) => [saved, ...prev]);
    setForm({ source: '', replacement: '', scope: 'global', modeId: '' });
  };

  const updateEntry = (id: string, patch: Partial<VocabularyEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const saveEntry = async (entry: VocabularyEntry) => {
    const saved = await window.susurrare.vocabulary.save({
      ...entry,
      updatedAt: Date.now(),
    });
    setEntries((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
  };

  const removeEntry = async (id: string) => {
    await window.susurrare.vocabulary.remove(id);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle
            title="Vocabulary"
            sectionId="help-vocabulary"
            ariaLabel="Open Vocabulary help section"
          />
          <p>Help Susurrare recognize names, acronyms, or jargon with replacements.</p>
        </div>
      </div>
      <div className="card">
        <div className="form-row">
          <label>
            Word or phrase
            <input
              placeholder="New term"
              value={form.source}
              onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
            />
          </label>
          <label>
            Replace with
            <input
              placeholder="Replacement"
              value={form.replacement}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, replacement: event.target.value }))
              }
            />
          </label>
          <label>
            Scope
            <select
              value={form.scope}
              onChange={(event) => setForm((prev) => ({ ...prev, scope: event.target.value }))}
            >
              <option value="global">Global</option>
              <option value="mode">Per mode</option>
            </select>
          </label>
          {form.scope === 'mode' && (
            <label>
              Mode
              <select
                value={form.modeId}
                onChange={(event) => setForm((prev) => ({ ...prev, modeId: event.target.value }))}
              >
                <option value="">Select mode</option>
                {modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="primary" onClick={addEntry}>
            Add to vocabulary
          </button>
        </div>
      </div>
      <div className="card">
        <h3>Entries</h3>
        {entries.length === 0 ? (
          <div className="empty-state">
            <h4>No vocabulary entries yet</h4>
            <p>Add a word or phrase above to get started.</p>
          </div>
        ) : (
          <div className="vocab-list">
            {entries.map((entry) => (
              <div key={entry.id} className="vocab-row">
                <input
                  value={entry.source}
                  onChange={(event) => updateEntry(entry.id, { source: event.target.value })}
                />
                <input
                  value={entry.replacement}
                  onChange={(event) => updateEntry(entry.id, { replacement: event.target.value })}
                  placeholder="Replacement"
                />
                <select
                  value={entry.modeId ? 'mode' : 'global'}
                  onChange={(event) =>
                    updateEntry(entry.id, {
                      modeId: event.target.value === 'mode' ? entry.modeId ?? modes[0]?.id : undefined,
                    })
                  }
                >
                  <option value="global">Global</option>
                  <option value="mode">Per mode</option>
                </select>
                {entry.modeId && (
                  <select
                    value={entry.modeId}
                    onChange={(event) => updateEntry(entry.id, { modeId: event.target.value })}
                  >
                    {modes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="vocab-actions">
                  <button className="chip" onClick={() => saveEntry(entry)}>
                    Save
                  </button>
                  <button className="chip danger" onClick={() => removeEntry(entry.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const ShortcutsView: React.FC = () => {
  const [entries, setEntries] = useState<ShortcutEntry[]>([]);
  const [modes, setModes] = useState<Mode[]>([]);
  const [form, setForm] = useState({ keyword: '', snippet: '', scope: 'global', modeId: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSnippet, setEditingSnippet] = useState('');
  const [status, setStatus] = useState<StatusState>({ text: null, nonce: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const [entryList, modeList] = await Promise.all([
          window.susurrare.shortcuts.list(),
          window.susurrare.modes.list(),
        ]);
        setEntries(entryList);
        setModes(modeList);
        if (modeList.length) {
          setForm((prev) =>
            prev.modeId ? prev : { ...prev, modeId: modeList[0]?.id ?? '' }
          );
        }
      } catch (error) {
        console.error(error);
        setStatus({ text: 'Unable to load shortcuts.', nonce: Date.now() });
      }
    };
    load();
  }, []);

  const addShortcut = async () => {
    const keyword = form.keyword.trim();
    const snippet = form.snippet.trim();
    if (!keyword || !snippet) {
      setStatus({ text: 'Keyword and snippet are required.', nonce: Date.now() });
      return;
    }
    const now = Date.now();
    const entry: ShortcutEntry = {
      id: `shortcut-${now}`,
      keyword,
      snippet,
      createdAt: now,
      updatedAt: now,
      modeId: form.scope === 'mode' ? form.modeId || undefined : undefined,
    };
    try {
      const saved = await window.susurrare.shortcuts.save(entry);
      setEntries((prev) => [saved, ...prev]);
      setForm((prev) => ({ ...prev, keyword: '', snippet: '' }));
      setStatus({ text: 'Shortcut saved.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setStatus({ text: 'Unable to save shortcut.', nonce: Date.now() });
    }
  };

  const removeShortcut = async (id: string) => {
    try {
      await window.susurrare.shortcuts.remove(id);
      setEntries((prev) => prev.filter((item) => item.id !== id));
      setStatus({ text: 'Shortcut deleted.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setStatus({ text: 'Unable to delete shortcut.', nonce: Date.now() });
    }
  };

  const startEdit = (entry: ShortcutEntry) => {
    setEditingId(entry.id);
    setEditingSnippet(entry.snippet);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingSnippet('');
  };

  const saveEdit = async (entry: ShortcutEntry) => {
    const nextSnippet = editingSnippet.trim();
    if (!nextSnippet) {
      setStatus({ text: 'Snippet text cannot be empty.', nonce: Date.now() });
      return;
    }
    try {
      const saved = await window.susurrare.shortcuts.save({
        ...entry,
        snippet: nextSnippet,
        updatedAt: Date.now(),
      });
      setEntries((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setEditingId(null);
      setEditingSnippet('');
      setStatus({ text: 'Shortcut updated.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      setStatus({ text: 'Unable to update shortcut.', nonce: Date.now() });
    }
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle
            title="Shortcuts"
            sectionId="help-shortcuts"
            ariaLabel="Open Shortcuts help section"
          />
          <p>Speak a keyword to insert a saved snippet when no other words are present.</p>
        </div>
      </div>
      <StatusBanner status={status} />
      <div className="card">
        <h3>Add shortcut</h3>
        <div className="vocab-list">
          <div className="vocab-row">
            <input
              placeholder="Keyword (spoken)"
              value={form.keyword}
              onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
            />
            <select
              value={form.scope}
              onChange={(event) => setForm((prev) => ({ ...prev, scope: event.target.value }))}
            >
              <option value="global">Global</option>
              <option value="mode">Mode-specific</option>
            </select>
            {form.scope === 'mode' && (
              <select
                value={form.modeId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, modeId: event.target.value }))
                }
              >
                {modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <textarea
            className="shortcut-textarea"
            rows={3}
            placeholder="Snippet to insert"
            value={form.snippet}
            onChange={(event) => setForm((prev) => ({ ...prev, snippet: event.target.value }))}
          />
          <div className="vocab-actions">
            <button className="primary" onClick={addShortcut}>
              Save shortcut
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Saved shortcuts</h3>
        {entries.length === 0 ? (
          <div className="empty-state">
            <h4>No shortcuts yet</h4>
            <p>Add a keyword and snippet to get started.</p>
          </div>
        ) : (
          <div className="shortcut-list">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`shortcut-row${editingId === entry.id ? ' is-editing' : ''}`}
              >
                <div className="shortcut-body">
                  <div className="shortcut-keyword">
                    {entry.keyword}
                    {editingId === entry.id && <span className="editing-badge">Editing</span>}
                  </div>
                  {editingId === entry.id ? (
                    <textarea
                      className="shortcut-textarea shortcut-edit"
                      rows={3}
                      value={editingSnippet}
                      onChange={(event) => setEditingSnippet(event.target.value)}
                    />
                  ) : (
                    <div className="shortcut-snippet">{entry.snippet}</div>
                  )}
                  <div className="muted">
                    {entry.modeId
                      ? `Mode-specific · ${modes.find((mode) => mode.id === entry.modeId)?.name ?? 'Mode'}`
                      : 'Global'}
                  </div>
                </div>
                <div className="vocab-actions shortcut-actions">
                  {editingId === entry.id ? (
                    <>
                      <button className="chip" onClick={() => saveEdit(entry)}>
                        Save
                      </button>
                      <button className="chip" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="chip" onClick={() => startEdit(entry)}>
                      Edit
                    </button>
                  )}
                  <button className="chip danger" onClick={() => removeShortcut(entry.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const SettingsView: React.FC = () => (
  <SettingsConfigView />
);

export const SoundView: React.FC = () => (
  <SoundConfigView />
);

export const ModelsView: React.FC = () => (
  <ModelsLibraryView />
);

export const HistoryView: React.FC = () => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState('');
  const [historyStatus, setHistoryStatus] = useState<StatusState>({ text: null, nonce: 0 });

  useEffect(() => {
    const load = async () => {
      const list = await window.susurrare.history.list();
      setItems(list);
    };
    load();
    const unsubscribe = window.susurrare.history.onUpdated((updated) => {
      setItems(updated);
    });
    return () => unsubscribe();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.text.toLowerCase().includes(needle));
  }, [items, query]);

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
    const groups = new Map<string, HistoryItem[]>();
    sorted.forEach((item) => {
      const label = formatDayLabel(item.createdAt);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)?.push(item);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  const formatSpeakerLabel = (speaker: string | undefined, index: number) => {
    if (!speaker) return `Speaker ${index + 1}`;
    const trimmed = speaker.trim();
    if (!trimmed) return `Speaker ${index + 1}`;
    if (/^speaker[_\s]?\d+$/i.test(trimmed)) {
      const number = trimmed.replace(/[^0-9]/g, '');
      return number ? `Speaker ${Number(number) + 1}` : 'Speaker';
    }
    if (/^speaker\b/i.test(trimmed)) return trimmed;
    return `Speaker ${trimmed}`;
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    if (!selectedIds.length) return;
    const result = await window.susurrare.history.exportSelection(selectedIds);
    setExportPath(result.filePath);
  };

  const handlePin = async (item: HistoryItem) => {
    await window.susurrare.history.pin(item.id, !item.pinned);
    setItems((prev) =>
      prev.map((entry) => (entry.id === item.id ? { ...entry, pinned: !item.pinned } : entry))
    );
  };

  const handleDelete = async (id: string) => {
    await window.susurrare.history.remove(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const handleCopy = (text: string) => window.susurrare.insert({ text, mode: 'copy' });
  const handleInsert = (text: string) => window.susurrare.insert({ text, mode: 'paste' });
  const addHistoryEntry = async () => {
    const text = newEntry.trim();
    if (!text) return;
    const now = Date.now();
    const item: HistoryItem = {
      id: `manual-${now}`,
      text,
      createdAt: now,
      pinned: false,
      modeId: 'default',
      status: 'success',
    };
    try {
      await window.susurrare.history.add(item);
      setItems((prev) => [item, ...prev]);
      setNewEntry('');
      setHistoryStatus({ text: 'Saved.', nonce: Date.now() });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      setHistoryStatus({ text: `Unable to save history: ${message}`, nonce: Date.now() });
    }
  };
  const formatLatency = (ms?: number) => {
    if (ms === undefined) return null;
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  };

  const formatInsertion = (item: HistoryItem) => {
    if (!item.insertion) return null;
    if (item.insertion.outcome === 'inserted') {
      return item.insertion.method === 'accessibility' ? 'Inserted at cursor' : 'Inserted';
    }
    if (item.insertion.outcome === 'clipboard') return 'Copied to clipboard';
    return 'Insertion failed';
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle title="History" sectionId="help-history" ariaLabel="Open History help section" />
          <p>Recent dictations saved locally for quick reuse.</p>
        </div>
      </div>
      <div className="history-toolbar">
        <input
          className="search"
          placeholder="Find..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="history-actions">
          <button className="chip" onClick={() => setSelectedIds(filtered.map((item) => item.id))}>
            Select all
          </button>
          <button
            className="chip"
            onClick={() => setSelectedIds([])}
            disabled={!selectedIds.length}
          >
            Clear
          </button>
          <button
            className="chip"
            onClick={handleExport}
            disabled={!selectedIds.length}
          >
            Export selection
          </button>
        </div>
      </div>
      <div className="history-input">
        <input
          className="search"
          placeholder="Type a history entry and press Save"
          value={newEntry}
          onChange={(event) => setNewEntry(event.target.value)}
        />
        <button className="primary" onClick={addHistoryEntry}>
          Save
        </button>
      </div>
      <StatusBanner status={historyStatus} />
      {exportPath && <div className="muted">Exported to {exportPath}</div>}
      {grouped.length === 0 ? (
        <div className="card empty-state">
          <h4>No history yet</h4>
          <p>Start a recording and your dictations will appear here.</p>
        </div>
      ) : (
        <div className="history-groups">
          {grouped.map(([label, entries]) => (
            <div key={label} className="history-group">
              <div className="history-label">{label}</div>
              <div className="history-list">
                {entries.map((item) => (
                  <div key={item.id} className={`history-item ${item.pinned ? 'pinned' : ''}`}>
                    <div className="history-row">
                      <label className="history-select">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                        />
                      </label>
                      <div className="history-text">{highlightText(item.text, query)}</div>
                    </div>
                    <div className="history-meta">
                      <span className={`history-badge ${item.status}`}>
                        {item.status === 'success'
                          ? 'Success'
                          : item.status === 'failed'
                          ? 'Failed'
                          : 'Cancelled'}
                      </span>
                      {formatLatency(item.latencyMs) && (
                        <span className="history-meta-item">
                          Latency {formatLatency(item.latencyMs)}
                        </span>
                      )}
                      {item.wordCount !== undefined && (
                        <span className="history-meta-item">Words {item.wordCount}</span>
                      )}
                      {formatInsertion(item) && (
                        <span className="history-meta-item">{formatInsertion(item)}</span>
                      )}
                    </div>
                    {item.status !== 'success' && item.errorMessage && (
                      <div className="history-error">{item.errorMessage}</div>
                    )}
                    {item.diarizedSegments && item.diarizedSegments.length > 0 && (
                      <div className="history-segments">
                        {item.diarizedSegments.map((segment, index) => (
                          <div key={`${item.id}-seg-${index}`} className="history-segment">
                            <span className="history-speaker">
                              {formatSpeakerLabel(segment.speaker, index)}
                            </span>
                            <span className="history-segment-text">
                              {highlightText(segment.text, query)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="history-item-actions">
                      <button className="chip" onClick={() => handleCopy(item.text)}>
                        Copy
                      </button>
                      <button className="chip" onClick={() => handleInsert(item.text)}>
                        Re-insert
                      </button>
                      <button className="chip" onClick={() => handlePin(item)}>
                        {item.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button className="chip danger" onClick={() => handleDelete(item.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DiagnosticsView: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);

  const handleExport = async () => {
    setStatus('Exporting diagnostics...');
    try {
      const result = await window.susurrare.diagnostics.export();
      setStatus(`Diagnostics saved to ${result.filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Export failed: ${message}`);
    }
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <ViewTitle
            title="Diagnostics"
            sectionId="help-diagnostics"
            ariaLabel="Open Diagnostics help section"
          />
          <p>Export troubleshooting data to share with support.</p>
        </div>
      </div>
      <div className="card">
        <p>Export logs and telemetry to share with support.</p>
        <button className="primary" onClick={handleExport}>
          Export diagnostics
        </button>
        {status && <div className="muted">{status}</div>}
      </div>
    </div>
  );
};
