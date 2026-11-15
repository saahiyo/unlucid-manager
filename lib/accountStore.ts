/**
 * Persistent local account registry.
 * Stable id is locked to gmail once known so cards don't vanish when
 * display names change or session tokens are refreshed.
 */

import { RawCookiesJson } from '../types';
import { getPrimaryToken } from '../cookieUtils';

export const ACCOUNTS_STORAGE_KEY = 'unlucid_accounts';
export const LEGACY_COOKIES_KEY = 'unlucid_imported_cookies';
export const DELETED_ACCOUNTS_KEY = 'unlucid_deleted_accounts';

export interface StoredAccount {
  /** Stable identity — email (lowercase) once known, otherwise temporary `acc_*` id */
  id: string;
  /** Display label (Unlucid name / user label). Never used as the storage key. */
  label: string;
  /** Locked after first successful profile fetch */
  email?: string;
  cookies: Record<string, string>;
  source: 'local' | 'env';
  createdAt: number;
  updatedAt: number;
}

function newTempId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `acc_${crypto.randomUUID()}`;
  }
  return `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeEmail(email?: string | null): string | undefined {
  if (!email || typeof email !== 'string') return undefined;
  const trimmed = email.trim().toLowerCase();
  return trimmed || undefined;
}

export function readDeletedIds(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function writeDeletedIds(ids: string[]): void {
  localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify([...new Set(ids)]));
}

export function markDeleted(id: string): void {
  const ids = readDeletedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    writeDeletedIds(ids);
  }
}

export function unmarkDeleted(id: string): void {
  writeDeletedIds(readDeletedIds().filter((d) => d !== id));
}

export function readStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a === 'object' && a.id && a.cookies && typeof a.cookies === 'object')
      .map((a) => ({
        id: String(a.id),
        label: String(a.label || a.id),
        email: normalizeEmail(a.email) || normalizeEmail(a.cookies?.gmail),
        cookies: a.cookies as Record<string, string>,
        source: a.source === 'env' ? 'env' : 'local',
        createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
        updatedAt: typeof a.updatedAt === 'number' ? a.updatedAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

/** Persist registry + mirror legacy cookies map for export / older paths */
export function writeStoredAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));

  const localOnly = accounts.filter((a) => a.source === 'local');
  const legacy: RawCookiesJson = {};
  localOnly.forEach((a) => {
    legacy[a.id] = a.cookies;
  });
  localStorage.setItem(LEGACY_COOKIES_KEY, JSON.stringify(legacy));
}

function migrateLegacyCookies(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(LEGACY_COOKIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RawCookiesJson;
    if (!parsed || typeof parsed !== 'object') return [];

    const now = Date.now();
    return Object.entries(parsed).map(([key, cookies]) => {
      const email = normalizeEmail(cookies?.gmail || cookies?.email);
      return {
        id: email || key,
        label: cookies?.name || key,
        email,
        cookies: { ...cookies },
        source: 'local' as const,
        createdAt: now,
        updatedAt: now,
      };
    });
  } catch {
    return [];
  }
}

export function parseEnvCookies(raw: string | undefined): StoredAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RawCookiesJson;
    if (!parsed || typeof parsed !== 'object') return [];
    const now = Date.now();
    return Object.entries(parsed).map(([key, cookies]) => {
      const email = normalizeEmail(cookies?.gmail || cookies?.email);
      return {
        id: email || key,
        label: cookies?.name || key,
        email,
        cookies: { ...cookies },
        source: 'env' as const,
        createdAt: now,
        updatedAt: now,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Load merged account list: local registry (+ legacy migrate) + env,
 * excluding deleted ids. Local wins over env on same id/email/token.
 */
export function loadMergedAccounts(envRaw?: string): StoredAccount[] {
  let local = readStoredAccounts();
  if (local.length === 0) {
    local = migrateLegacyCookies();
    if (local.length > 0) writeStoredAccounts(local);
  }

  const envAccounts = parseEnvCookies(envRaw);
  const deleted = new Set(readDeletedIds());

  const byId = new Map<string, StoredAccount>();
  const tokenToId = new Map<string, string>();

  const upsert = (account: StoredAccount, preferIncoming: boolean) => {
    if (deleted.has(account.id)) return;
    if (account.email && deleted.has(account.email)) return;

    const email = normalizeEmail(account.email) || normalizeEmail(account.cookies.gmail);
    const token = getPrimaryToken(account.cookies);

    // Prefer existing entry matched by email or session token
    let existingId: string | undefined;
    if (email) {
      for (const [id, existing] of byId) {
        if (normalizeEmail(existing.email) === email || normalizeEmail(existing.cookies.gmail) === email) {
          existingId = id;
          break;
        }
      }
    }
    if (!existingId && token) {
      existingId = tokenToId.get(token);
    }
    if (!existingId && byId.has(account.id)) {
      existingId = account.id;
    }

    if (existingId) {
      const prev = byId.get(existingId)!;
      const merged: StoredAccount = preferIncoming
        ? {
            ...prev,
            ...account,
            id: prev.id,
            email: email || prev.email,
            label: account.label || prev.label,
            cookies: { ...prev.cookies, ...account.cookies },
            source: prev.source === 'local' || account.source === 'local' ? 'local' : 'env',
            createdAt: prev.createdAt,
            updatedAt: Date.now(),
          }
        : {
            ...account,
            ...prev,
            id: prev.id,
            email: prev.email || email,
            label: prev.label || account.label,
            cookies: { ...account.cookies, ...prev.cookies },
            source: prev.source === 'local' || account.source === 'local' ? 'local' : 'env',
            createdAt: Math.min(prev.createdAt, account.createdAt),
            updatedAt: Math.max(prev.updatedAt, account.updatedAt),
          };

      if (email) {
        merged.email = email;
        merged.cookies = { ...merged.cookies, gmail: email };
      }

      byId.delete(existingId);
      // Keep stable id; if we now know email and prev was temp, promote once
      const nextId =
        email && (prev.id.startsWith('acc_') || !prev.email) && !byId.has(email) && existingId !== email
          ? email
          : prev.id;
      merged.id = nextId;
      byId.set(nextId, merged);
      if (token) tokenToId.set(token, nextId);
      return;
    }

    const id = email && !account.id.startsWith('acc_') ? email : account.id;
    const stored: StoredAccount = {
      ...account,
      id,
      email,
      cookies: email ? { ...account.cookies, gmail: email } : account.cookies,
    };
    byId.set(id, stored);
    if (token) tokenToId.set(token, id);
  };

  // Env first, then local overwrites / merges
  envAccounts.forEach((a) => upsert(a, false));
  local.forEach((a) => upsert(a, true));

  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertAccount(account: StoredAccount): StoredAccount[] {
  const accounts = readStoredAccounts();
  const next: StoredAccount = { ...account, source: 'local', updatedAt: Date.now() };
  const without = accounts.filter((a) => {
    if (a.id === next.id) return false;
    if (next.email && (a.id === next.email || normalizeEmail(a.email) === next.email)) return false;
    return true;
  });
  without.push(next);
  writeStoredAccounts(without);
  return without;
}

export function removeAccount(id: string): void {
  const accounts = readStoredAccounts().filter((a) => a.id !== id);
  writeStoredAccounts(accounts);
  markDeleted(id);
}

export function createLocalAccount(
  label: string,
  cookies: Record<string, string>
): StoredAccount {
  const email = normalizeEmail(cookies.gmail || cookies.email);
  const now = Date.now();
  return {
    id: email || newTempId(),
    label: label.trim() || email || 'Account',
    email,
    cookies: email ? { ...cookies, gmail: email } : { ...cookies },
    source: 'local',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * After a successful profile fetch: lock email onto the account.
 * Promotes temp `acc_*` ids to email once, without colliding.
 */
export function lockAccountIdentity(
  account: StoredAccount,
  email?: string | null,
  displayName?: string | null
): StoredAccount {
  const normalized = normalizeEmail(email);
  const now = Date.now();
  let next: StoredAccount = {
    ...account,
    label: displayName?.trim() || account.label,
    updatedAt: now,
    cookies: { ...account.cookies },
  };

  if (normalized) {
    next.email = normalized;
    next.cookies.gmail = normalized;
    if (displayName?.trim()) next.cookies.name = displayName.trim();

    // Promote temporary id → email once
    if (account.id.startsWith('acc_') || !account.email) {
      const others = readStoredAccounts();
      const collision = others.some(
        (a) => a.id !== account.id && (a.id === normalized || normalizeEmail(a.email) === normalized)
      );
      if (!collision) {
        next = { ...next, id: normalized };
      }
    }
  }

  return next;
}

export function updateAccountCookiesOnly(
  account: StoredAccount,
  newCookies: Record<string, string>
): StoredAccount {
  const email = account.email || normalizeEmail(account.cookies.gmail);
  const merged = {
    ...account.cookies,
    ...newCookies,
  };
  // Never let a cookie paste wipe locked identity
  if (email) {
    merged.gmail = email;
  }
  if (account.cookies.name && !merged.name) {
    merged.name = account.cookies.name;
  }

  return {
    ...account,
    cookies: merged,
    email,
    updatedAt: Date.now(),
    source: 'local',
  };
}

export function findByEmail(accounts: StoredAccount[], email?: string | null): StoredAccount | undefined {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  return accounts.find(
    (a) => a.id === normalized || normalizeEmail(a.email) === normalized || normalizeEmail(a.cookies.gmail) === normalized
  );
}
