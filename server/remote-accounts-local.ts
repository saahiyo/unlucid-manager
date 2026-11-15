/**
 * Node-only local file store for Vite middleware when Redis is not configured.
 * Do not import this from Edge API routes.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  hasRemoteStore,
  normalizeRemoteMap,
  type RemoteAccount,
  writeRemoteAccounts as writeRedisAccounts,
  readRemoteAccounts as readRedisAccounts,
} from './remote-accounts';

function localFilePath(): string {
  return join(process.cwd(), '.data', 'remote-accounts.json');
}

async function readLocalFile(): Promise<Record<string, RemoteAccount>> {
  try {
    const raw = await readFile(localFilePath(), 'utf8');
    return normalizeRemoteMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function writeLocalFile(map: Record<string, RemoteAccount>): Promise<void> {
  const file = localFilePath();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(map, null, 2), 'utf8');
}

export async function readAccountsForVite(): Promise<Record<string, RemoteAccount>> {
  if (hasRemoteStore()) return readRedisAccounts();
  return readLocalFile();
}

export async function writeAccountsForVite(map: Record<string, RemoteAccount>): Promise<void> {
  if (hasRemoteStore()) {
    await writeRedisAccounts(map);
    return;
  }
  await writeLocalFile(map);
}

export async function upsertAccountForVite(
  account: Omit<RemoteAccount, 'updatedAt'> & { updatedAt?: number }
): Promise<RemoteAccount> {
  const map = await readAccountsForVite();
  const next: RemoteAccount = {
    id: account.id,
    email: account.email,
    label: account.label,
    cookies: account.cookies,
    updatedAt: account.updatedAt || Date.now(),
  };
  if (next.email) {
    for (const [key, existing] of Object.entries(map)) {
      if (key === next.id) continue;
      if (existing.email?.toLowerCase() === next.email.toLowerCase()) delete map[key];
    }
  }
  map[next.id] = next;
  await writeAccountsForVite(map);
  return next;
}

export async function deleteAccountForVite(id: string): Promise<boolean> {
  const map = await readAccountsForVite();
  const email = map[id]?.email?.toLowerCase();
  let removed = false;
  if (map[id]) {
    delete map[id];
    removed = true;
  }
  if (email) {
    for (const [key, existing] of Object.entries(map)) {
      if (existing.email?.toLowerCase() === email || key === email) {
        delete map[key];
        removed = true;
      }
    }
  }
  if (removed) await writeAccountsForVite(map);
  return removed;
}

export async function replaceAccountsForVite(
  accounts: Array<Omit<RemoteAccount, 'updatedAt'> & { updatedAt?: number }>
): Promise<RemoteAccount[]> {
  const map: Record<string, RemoteAccount> = {};
  const now = Date.now();
  for (const account of accounts.slice(0, 40)) {
    if (!account?.id || !account.cookies || typeof account.cookies !== 'object') continue;
    map[account.id] = {
      id: account.id,
      email: account.email,
      label: account.label,
      cookies: account.cookies,
      updatedAt: account.updatedAt || now,
    };
  }
  await writeAccountsForVite(map);
  return Object.values(map);
}
