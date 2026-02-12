import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryItem } from '@susurrare/core';
import {
  DiagnosticsView,
  HistoryView,
  HomeView,
  ModelsView,
  ModesView,
  ShortcutsView,
  SettingsView,
  SoundView,
  VocabularyView,
} from './views';
import { Sidebar } from './Sidebar';

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'modes', label: 'Modes' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'sound', label: 'Sound' },
  { id: 'models', label: 'Models Library' },
  { id: 'history', label: 'History' },
  { id: 'diagnostics', label: 'Diagnostics' },
] as const;

export type NavId = (typeof NAV_ITEMS)[number]['id'];

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);

const computeHomeStats = (items: HistoryItem[]) => {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekItems = items.filter((item) => item.createdAt >= weekAgo && item.status === 'success');

  const wordCounts = weekItems.map((item) => item.wordCount ?? countWords(item.text));
  const wordsThisWeek = wordCounts.reduce((total, count) => total + count, 0);

  const speedSamples = weekItems
    .map((item, index) => ({
      words: wordCounts[index],
      durationMs: item.audioDurationMs ?? 0,
    }))
    .filter((sample) => sample.words > 0 && sample.durationMs > 0);
  const averageWpm = speedSamples.length
    ? speedSamples.reduce((total, sample) => total + sample.words / (sample.durationMs / 60000), 0) /
      speedSamples.length
    : null;

  const totalDurationMs = weekItems.reduce((total, item, index) => {
    if (item.audioDurationMs) return total + item.audioDurationMs;
    const words = wordCounts[index];
    if (!words) return total;
    return total + (words / 150) * 60000;
  }, 0);
  const totalMinutes = totalDurationMs / 60000;

  const appNames = weekItems
    .map((item) => item.appName)
    .filter((appName): appName is string => !!appName);
  const appsUsed = appNames.length ? new Set(appNames).size : 0;

  return {
    averageSpeed: averageWpm ? `${Math.round(averageWpm)} WPM` : '—',
    wordsThisWeek: formatNumber(wordsThisWeek),
    appsUsed: formatNumber(appsUsed),
    savedThisWeek: `${Math.max(0, Math.round(totalMinutes))} mins`,
  };
};

export const App: React.FC = () => {
  const [active, setActive] = useState<NavId>('home');
  const [recordingStatus, setRecordingStatus] = useState<
    'idle' | 'recording' | 'processing' | 'error'
  >('idle');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const homeStats = useMemo(() => computeHomeStats(historyItems), [historyItems]);
  const previousStatusRef = useRef<typeof recordingStatus>('idle');

  useEffect(() => {
    const applyTheme = (value: 'light' | 'dark' | 'system') => {
      const root = document.documentElement;
      if (value === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', value);
      }
    };
    window.susurrare.settings
      .get()
      .then((settings) => applyTheme(settings.theme ?? 'system'))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = window.susurrare.onRecordingStatus((event) => {
      setRecordingStatus(event.status);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    previousStatusRef.current = recordingStatus;
  }, [recordingStatus]);

  useEffect(() => {
    window.susurrare.history
      .list()
      .then(setHistoryItems)
      .catch(() => undefined);
    const unsubscribe = window.susurrare.history.onUpdated((items) => {
      setHistoryItems(items);
    });
    return () => unsubscribe();
  }, []);

  const content = useMemo(() => {
    switch (active) {
      case 'modes':
        return <ModesView />;
      case 'vocabulary':
        return <VocabularyView />;
      case 'shortcuts':
        return <ShortcutsView />;
      case 'configuration':
        return <SettingsView />;
      case 'sound':
        return <SoundView />;
      case 'models':
        return <ModelsView />;
      case 'history':
        return <HistoryView />;
      case 'diagnostics':
        return <DiagnosticsView />;
      default:
        return <HomeView stats={homeStats} historyItems={historyItems} />;
    }
  }, [active, homeStats, historyItems]);

  return (
    <div className="app-shell">
      <Sidebar items={NAV_ITEMS} active={active} onSelect={setActive} />
      <main className="app-main">
        <header className="top-bar">
          <div className="top-title">
            <div className="brand-mark" aria-hidden="true" />
            <span>Susurrare</span>
          </div>
          <div className="top-actions">
            <div className={`recording-pill ${recordingStatus}`}>
              <span className="recording-dot" />
              {recordingStatus === 'recording'
                ? 'Recording'
                : recordingStatus === 'processing'
                ? 'Processing'
                : recordingStatus === 'error'
                ? 'Error'
                : 'Idle'}
            </div>
            <button className="pill" onClick={() => window.susurrare.help.open()}>
              Help
            </button>
            <button className="icon-button" aria-label="Profile">
              <span className="avatar">ER</span>
            </button>
          </div>
        </header>
        <section className="content">{content}</section>
      </main>
    </div>
  );
};
