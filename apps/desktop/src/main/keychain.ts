import { execFile } from 'child_process';
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

const SECURITY_BIN = '/usr/bin/security';
const SERVICE_NAME = 'com.susurrare.desktop.openai';
const ACCOUNT_NAME = 'susurrare';
const ENCRYPTED_KEY_FILENAME = 'openai-api-key.enc.json';

const runSecurity = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    execFile(SECURITY_BIN, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        reject(new Error(message));
        return;
      }
      resolve((stdout ?? '').trim());
    });
  });

const isMissingItemError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('could not be found in the keychain');
};

const encryptedKeyFilePath = () => join(app.getPath('userData'), ENCRYPTED_KEY_FILENAME);

const loadEncryptedApiKey = () => {
  const filePath = encryptedKeyFilePath();
  if (!existsSync(filePath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as { ciphertext?: unknown };
  if (typeof raw.ciphertext !== 'string' || raw.ciphertext.length === 0) return null;
  const encrypted = Buffer.from(raw.ciphertext, 'base64');
  if (!encrypted.length) return null;
  const decrypted = safeStorage.decryptString(encrypted).trim();
  return decrypted || null;
};

const saveEncryptedApiKey = (apiKey: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is unavailable on this system.');
  }
  const encrypted = safeStorage.encryptString(apiKey);
  writeFileSync(
    encryptedKeyFilePath(),
    JSON.stringify({ ciphertext: encrypted.toString('base64') }, null, 2),
    {
      encoding: 'utf-8',
      mode: 0o600,
    }
  );
};

const deleteEncryptedApiKey = () => {
  const filePath = encryptedKeyFilePath();
  if (!existsSync(filePath)) return;
  unlinkSync(filePath);
};

export const loadOpenAiApiKey = async (): Promise<string | null> => {
  const encryptedValue = loadEncryptedApiKey();
  if (encryptedValue) return encryptedValue;

  if (process.platform === 'darwin') {
    try {
      const legacyValue = await runSecurity([
        'find-generic-password',
        '-a',
        ACCOUNT_NAME,
        '-s',
        SERVICE_NAME,
        '-w',
      ]);
      const trimmed = legacyValue.trim();
      if (!trimmed) return null;
      try {
        saveEncryptedApiKey(trimmed);
        await runSecurity(['delete-generic-password', '-a', ACCOUNT_NAME, '-s', SERVICE_NAME]);
      } catch {
        // Keep legacy item if migration cannot complete.
      }
      return trimmed;
    } catch (error) {
      if (isMissingItemError(error)) return null;
      throw error;
    }
  }
  return null;
};

export const saveOpenAiApiKey = async (apiKey: string): Promise<void> => {
  saveEncryptedApiKey(apiKey);
};

export const deleteOpenAiApiKey = async (): Promise<void> => {
  deleteEncryptedApiKey();
  if (process.platform === 'darwin') {
    try {
      await runSecurity(['delete-generic-password', '-a', ACCOUNT_NAME, '-s', SERVICE_NAME]);
    } catch (error) {
      if (isMissingItemError(error)) return;
      throw error;
    }
  }
};
