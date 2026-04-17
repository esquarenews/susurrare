#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const APP_NAME = 'Vocsen';
const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const iconSource = resolve(scriptDir, '../build/icon.icns');

if (!existsSync(iconSource)) {
  console.warn(`[brand-dev-electron] Missing icon source: ${iconSource}`);
  process.exit(0);
}

let electronPackagePath;
try {
  electronPackagePath = require.resolve('electron/package.json');
} catch {
  console.warn('[brand-dev-electron] Electron package not found.');
  process.exit(0);
}

const electronRoot = dirname(electronPackagePath);
const appBundlePath = join(electronRoot, 'dist', 'Electron.app');
const infoPlistPath = join(appBundlePath, 'Contents', 'Info.plist');
const iconDestination = join(appBundlePath, 'Contents', 'Resources', 'electron.icns');

if (!existsSync(infoPlistPath) || !existsSync(iconDestination)) {
  console.warn(`[brand-dev-electron] Electron app bundle not found at ${appBundlePath}`);
  process.exit(0);
}

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status ?? 'unknown'}`);
  }
};

copyFileSync(iconSource, iconDestination);

const plistUpdates = {
  CFBundleDisplayName: APP_NAME,
  CFBundleName: APP_NAME,
  NSMicrophoneUsageDescription: `${APP_NAME} needs access to the microphone for speech-to-text dictation.`,
  NSAppleEventsUsageDescription: `${APP_NAME} needs permission to control System Events for paste insertion.`,
  NSInputMonitoringUsageDescription: `${APP_NAME} needs permission to listen for global hotkeys.`,
};

for (const [key, value] of Object.entries(plistUpdates)) {
  run('/usr/bin/plutil', ['-replace', key, '-string', value, infoPlistPath]);
}

run('/usr/bin/touch', [appBundlePath]);
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appBundlePath]);
console.log(`[brand-dev-electron] Branded dev host bundle at ${appBundlePath}`);
