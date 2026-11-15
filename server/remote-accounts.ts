/**
 * Writable server-side account cookie store for cron auto-claim.
 * Prefer Upstash Redis (set once). Local Vite falls back to .data/remote-accounts.json.
 */

import type { BatchAccountItem } from './unlucid-proxy';
import { parseCookiesEnv } from './unlucid-proxy';

export const REMOTE_ACCOUNTS_KEY = 'unlucid:accounts';

export interface RemoteAccount {
  id: string;
  email?: string;
  label?: string;
  cookies: Record<string, string>;
  updatedAt: number;
}

type Env = Record<string, string | undefined>;

function envOf(env?: Env): Env {
  return env || (typeof process !== 'undefined' ? process.env : {});
}

export function hasRemoteStore(env?: Env): boolean {
  const e = envOf(env);
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) return true;
  // Node / Vite local file fallback
  if (typeof process !== 'undefined' && process.versions?.node) return true;
  return false;
}

async function upstashCommand(env: Env, command: unknown[]): Promise<unknown> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Upstash is not configured');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  const data = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Upstash ${res.status}`);
  }
  return data?.result;
}

function localFilePath(): string {
  return `${process.cwd()}/.data/remote-accounts.json`;
}

async function readLocalFile(): Promise<Record<string, RemoteAccount>> {
  try {
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile(localFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, RemoteAccount>;
  } catch {
    return {};
  }
}

async function writeLocalFile(map: Record<string, RemoteAccount>): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = localFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(map, null, 2), 'utf8');
}

function normalizeMap(raw: unknown): Record<string, RemoteAccount> {
  if (!raw) return {};
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const out: Record<string, RemoteAccount> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
    if (!value || typeof value !== 'object' || !value.cookies || typeof value.cookies !== 'object') continue;
    const id = String(value.id || key);
    out[id] = {
      id,
      email: typeof value.email === 'string' ? value.email : undefined,
      label: typeof value.label === 'string' ? value.label : undefined,
      cookies: value.cookies as Record<string, string>,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    };
  }
  return out;
}

export async function readRemoteAccounts(env?: Env): Promise<Record<string, RemoteAccount>> {
  const e = envOf(env);
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) {
    const result = await upstashCommand(e, ['GET', REMOTE_ACCOUNTS_KEY]);
    return normalizeMap(result);
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    return readLocalFile();
  }
  return {};
}

export async function writeRemoteAccounts(
  map: Record<string, RemoteAccount>,
  env?: Env
): Promise<void> {
  const e = envOf(env);
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) {
    await upstashCommand(e, ['SET', REMOTE_ACCOUNTS_KEY, JSON.stringify(map)]);
    return;
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    await writeLocalFile(map);
    return;
  }
  throw new Error('No remote store configured (add Upstash Redis on Vercel)');
}

export async function upsertRemoteAccount(
  account: Omit<RemoteAccount, 'updatedAt'> & { updatedAt?: number },
  env?: Env
): Promise<RemoteAccount> {
  const map = await readRemoteAccounts(env);
  const next: RemoteAccount = {
    id: account.id,
    email: account.email,
    label: account.label,
    cookies: account.cookies,
    updatedAt: account.updatedAt || Date.now(),
  };

  // Drop any prior row with same email under a different id
  if (next.email) {
    for (const [key, existing] of Object.entries(map)) {
      if (key === next.id) continue;
      if (existing.email?.toLowerCase() === next.email.toLowerCase()) {
        delete map[key];
      }
    }
  }

  map[next.id] = next;
  await writeRemoteAccounts(map, env);
  return next;
}

export async function deleteRemoteAccount(id: string, env?: Env): Promise<boolean> {
  const map = await readRemoteAccounts(env);
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
  if (removed) await writeRemoteAccounts(map, env);
  return removed;
}

export async function replaceRemoteAccounts(
  accounts: Array<Omit<RemoteAccount, 'updatedAt'> & { updatedAt?: number }>,
  env?: Env
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
  await writeRemoteAccounts(map, env);
  return Object.values(map);
}

/** Cron loader: remote store first, then env fallback. */
export async function loadCronAccounts(
  env?: Env
): Promise<{ accounts: BatchAccountItem[]; source: 'remote' | 'env' | 'empty' }> {
  const e = envOf(env);
  try {
    const remote = await readRemoteAccounts(e);
    const accounts = Object.values(remote)
      .filter((a) => a.cookies && Object.keys(a.cookies).length > 0)
      .map((a) => ({ id: a.id, cookies: a.cookies }))
      .slice(0, 40);
    if (accounts.length > 0) {
      return { accounts, source: 'remote' };
    }
  } catch (err) {
    console.warn('Remote account store read failed, falling back to env:', err);
  }

  const fromEnv = parseCookiesEnv(e.UNLUCID_COOKIES || e.VITE_COOKIES);
  if (fromEnv.length > 0) {
    return { accounts: fromEnv, source: 'env' };
  }
  return { accounts: [], source: 'empty' };
}

/** Authorize dashboard sync (SYNC_SECRET or CRON_SECRET). */
export function authorizeSyncRequest(
  req: Request,
  env?: Env
): { ok: true } | { ok: false; status: number; message: string } {
  const e = envOf(env);
  const secret = e.SYNC_SECRET || e.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 500,
      message: 'SYNC_SECRET or CRON_SECRET is not configured',
    };
  }

  const auth = req.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const querySecret = new URL(req.url).searchParams.get('secret');
  const provided = bearer || querySecret;

  if (!provided || provided !== secret) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  return { ok: true };
}
