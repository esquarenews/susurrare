import { app } from 'electron';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';
import log from 'electron-log';
import type { Settings } from '@susurrare/core';
import { loadState } from './store';

const diagnosticsDir = () => join(app.getPath('userData'), 'diagnostics');
const errorsFile = () => join(app.getPath('userData'), 'recent-errors.json');
const redactSecrets = (value: string) =>
  value
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-REDACTED')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, 'Bearer REDACTED');

export const recordError = (error: unknown) => {
  const entry = {
    timestamp: Date.now(),
    message: redactSecrets(error instanceof Error ? error.message : String(error)),
  };
  try {
    const existing = loadRecentErrors();
    existing.unshift(entry);
    writeFileSync(errorsFile(), JSON.stringify(existing.slice(0, 50), null, 2), 'utf-8');
  } catch (writeError) {
    log.error('Failed to write recent errors', writeError);
  }
};

export const loadRecentErrors = () => {
  try {
    if (!existsSync(errorsFile())) return [] as Array<{ timestamp: number; message: string }>;
    const parsed = JSON.parse(readFileSync(errorsFile(), 'utf-8')) as Array<{
      timestamp: number;
      message: string;
    }>;
    if (!Array.isArray(parsed)) return [] as Array<{ timestamp: number; message: string }>;
    return parsed;
  } catch (error) {
    log.error('Failed to read recent errors', error);
    return [] as Array<{ timestamp: number; message: string }>;
  }
};

const redactSettings = (settings: Settings) => ({
  ...settings,
  openAiApiKey: settings.openAiApiKey ? 'REDACTED' : undefined,
});

export const exportDiagnostics = async () => {
  const targetDir = diagnosticsDir();
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  const filePath = join(targetDir, `susurrare-diagnostics-${Date.now()}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = createWriteStream(filePath);

  return new Promise<{ filePath: string }>((resolve, reject) => {
    stream.on('close', () => resolve({ filePath }));
    archive.on('error', (err: Error) => reject(err));

    archive.pipe(stream);

    const state = loadState();
    const safeSettings = redactSettings(state.settings);
    archive.append(JSON.stringify(safeSettings, null, 2), { name: 'settings.json' });
    archive.append(JSON.stringify(state.history.slice(0, 200), null, 2), { name: 'history.json' });
    archive.append(JSON.stringify(state.vocabulary, null, 2), { name: 'vocabulary.json' });
    archive.append(JSON.stringify(state.modes, null, 2), { name: 'modes.json' });
    archive.append(JSON.stringify(loadRecentErrors(), null, 2), { name: 'recent-errors.json' });

    const logFile = log.transports.file.getFile().path;
    if (existsSync(logFile)) {
      archive.file(logFile, { name: 'logs/app.log' });
    }

    const telemetryPath = join(app.getPath('userData'), 'telemetry.json');
    if (existsSync(telemetryPath)) {
      archive.file(telemetryPath, { name: 'telemetry.json' });
    }

    archive.finalize();
  });
};
