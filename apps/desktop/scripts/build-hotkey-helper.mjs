import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, '..');
const repoRoot = resolve(desktopDir, '..', '..');
const sourcePath = resolve(repoRoot, 'packages', 'platform-macos', 'src', 'hotkey-helper.swift');
const outputPath = resolve(desktopDir, 'resources', 'bin', 'vocsen-hotkey-helper');

mkdirSync(dirname(outputPath), { recursive: true });

const shouldRebuild = () => {
  if (!existsSync(outputPath)) return true;
  return statSync(sourcePath).mtimeMs > statSync(outputPath).mtimeMs;
};

if (shouldRebuild()) {
  execFileSync(
    'xcrun',
    ['swiftc', '-O', sourcePath, '-o', outputPath, '-framework', 'Carbon', '-framework', 'AppKit'],
    { stdio: 'inherit' }
  );
  chmodSync(outputPath, 0o755);
  try {
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', outputPath], {
      stdio: 'ignore',
    });
  } catch {
    // Development ad-hoc signing is best-effort only.
  }
}
