import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const electronMain = join(__dirname, '..', 'out', 'main', 'index.js');

test('navigation and CRUD basics', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'vocsen-e2e-'));
  const app = await electron.launch({
    args: [electronMain, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      SUSURRARE_DISABLE_HOTKEYS: '1',
    },
  });
  await app.firstWindow();
  await expect
    .poll(() => app.windows().some((window) => window.url().startsWith('file:')))
    .toBe(true);
  const page = app.windows().find((window) => window.url().startsWith('file:'));
  if (!page) throw new Error('Vocsen main window did not open');

  try {
    await page.getByRole('button', { name: 'Modes' }).click();
    await expect(page.getByRole('heading', { name: /^Modes\b/ })).toBeVisible();

    await page.getByRole('button', { name: 'New mode', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New mode' }).first()).toBeVisible();
    await expect(page.getByLabel('Model')).toHaveValue('latest');

    await page.getByRole('button', { name: 'Models Library' }).click();
    await expect(page.getByRole('heading', { name: /^Models Library\b/ })).toBeVisible();
    await expect(page.getByText('gpt-live-transcribe', { exact: true })).toBeVisible();
    await expect(page.getByText('gpt-transcribe', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Vocabulary' }).click();
    await expect(page.getByRole('heading', { name: /^Vocabulary\b/ })).toBeVisible();

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: /^History\b/ })).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
