import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryItem, PermissionStatus } from '@susurrare/core';
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

type RecordingBannerState = {
  text: string | null;
  nonce: number;
  tone: 'neutral' | 'error';
};

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

const getMissingPermissionCount = (permissions: PermissionStatus | null) => {
  if (!permissions) return 0;
  let count = 0;
  if (permissions.accessibility !== 'granted') count += 1;
  if (permissions.microphone !== 'granted') count += 1;
  return count;
};

const FloatingStatusBanner: React.FC<{ banner: RecordingBannerState }> = ({ banner }) => {
  const message = banner.text;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 6000);
    return () => clearTimeout(timer);
  }, [message, banner.nonce]);

  return (
    <div className="status-banner-slot">
      <div
        key={`${message ?? 'empty'}-${banner.nonce}`}
        className={`status-banner${message ? '' : ' is-empty'}${visible ? '' : ' is-hidden'}${
          banner.tone === 'error' ? ' is-error' : ''
        }`}
        aria-hidden={!message}
      >
        {message ?? '\u00A0'}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const [active, setActive] = useState<NavId>('home');
  const [settingsTargetSection, setSettingsTargetSection] = useState<'keyboard-shortcuts' | null>(
    null
  );
  const [recordingStatus, setRecordingStatus] = useState<
    'idle' | 'recording' | 'processing' | 'error'
  >('idle');
  const [recordingBanner, setRecordingBanner] = useState<RecordingBannerState>({
    text: null,
    nonce: 0,
    tone: 'neutral',
  });
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const homeStats = useMemo(() => computeHomeStats(historyItems), [historyItems]);
  const missingPermissionCount = useMemo(
    () => getMissingPermissionCount(permissions),
    [permissions]
  );
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
      setRecordingBanner({
        text: event.message ?? null,
        nonce: event.timestamp,
        tone: event.status === 'error' ? 'error' : 'neutral',
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    previousStatusRef.current = recordingStatus;
  }, [recordingStatus]);

  useEffect(() => {
    let cancelled = false;
    const loadPermissions = () => {
      window.susurrare.permissions
        .get()
        .then((next) => {
          if (!cancelled) setPermissions(next);
        })
        .catch(() => undefined);
    };
    loadPermissions();
    window.addEventListener('focus', loadPermissions);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', loadPermissions);
    };
  }, []);

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

  const handleNavSelect = (next: NavId) => {
    setActive(next);
    setSettingsTargetSection(null);
  };

  const handleHomeNavigate = (target: {
    view: 'configuration' | 'modes' | 'vocabulary';
    section?: 'keyboard-shortcuts';
  }) => {
    setActive(target.view);
    setSettingsTargetSection(
      target.view === 'configuration' ? target.section ?? null : null
    );
  };

  const content = useMemo(() => {
    switch (active) {
      case 'modes':
        return <ModesView />;
      case 'vocabulary':
        return <VocabularyView />;
      case 'shortcuts':
        return <ShortcutsView />;
      case 'configuration':
        return <SettingsView targetSection={settingsTargetSection} />;
      case 'sound':
        return <SoundView />;
      case 'models':
        return <ModelsView />;
      case 'history':
        return <HistoryView />;
      case 'diagnostics':
        return <DiagnosticsView />;
      default:
        return (
          <HomeView
            stats={homeStats}
            historyItems={historyItems}
            onNavigate={handleHomeNavigate}
          />
        );
    }
  }, [active, handleHomeNavigate, historyItems, homeStats, settingsTargetSection]);

  return (
    <div className="app-shell">
      <Sidebar items={NAV_ITEMS} active={active} onSelect={handleNavSelect} />
      <main className="app-main">
        <header className="top-bar">
          <div className="top-title">
            <div className="brand-mark" aria-hidden="true" />
            <span>Susurrare</span>
          </div>
          <div className="top-actions">
            {missingPermissionCount > 0 && (
              <button className="pill warning-pill" onClick={() => setActive('configuration')}>
                Permissions needed ({missingPermissionCount})
              </button>
            )}
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
        <FloatingStatusBanner banner={recordingBanner} />
      </main>
    </div>
  );
};
