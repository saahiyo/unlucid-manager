/**
 * Owned Unlucid proxy — fetches Unlucid APIs with session cookies
 * and returns a stable normalized response for the dashboard.
 */

import {
  extractClaimData,
  extractProfileMetadata,
} from '../cookieUtils';

export const UNLUCID_ORIGIN = 'https://unlucid.ai';

const SKIP_COOKIE_KEYS = new Set(['gmail', 'name', 'email', 'image', 'id']);

export type ProxyErrorCode =
  | 'OK'
  | 'SESSION_EXPIRED'
  | 'ALREADY_CLAIMED'
  | 'INVALID_REQUEST'
  | 'UPSTREAM_ERROR'
  | 'ERROR';

export interface NormalizedProfile {
  id?: string;
  name?: string;
  email?: string;
  image?: string;
  gems: number;
  canClaimFreeGems: boolean;
  nextFreeGemsAt: number;
  referralCode?: string;
  referralCodeUses?: number;
  referralLimit?: number;
  referralReward?: number;
  isAdmin?: boolean;
  matureEnabled?: boolean;
  canApplyReferral?: boolean;
}

export interface AccountResult {
  ok: boolean;
  code: ProxyErrorCode;
  message?: string;
  status: number;
  profile?: NormalizedProfile;
}

export interface ClaimResult {
  ok: boolean;
  code: ProxyErrorCode;
  message?: string;
  status: number;
  profile?: NormalizedProfile;
}

export interface BatchAccountItem {
  id: string;
  cookies: Record<string, string>;
}

function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(origin?: string | null): { status: number; headers: Record<string, string>; body: string } {
  return { status: 204, headers: corsHeaders(origin), body: '' };
}

export function jsonResponse(
  data: unknown,
  status = 200,
  origin?: string | null
): { status: number; headers: Record<string, string>; body: string } {
  return {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

/** Build Cookie header; drop local-only metadata keys. */
export function toCookieHeader(cookies: Record<string, string> = {}): string {
  return Object.entries(cookies)
    .filter(([key, value]) => {
      if (!key || value == null || value === '') return false;
      if (SKIP_COOKIE_KEYS.has(key)) return false;
      return true;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function hasSessionCookie(cookies: Record<string, string>): boolean {
  return Boolean(
    cookies['__Secure-authjs.session-token'] ||
      cookies['__Secure-better-auth.session_token'] ||
      Object.keys(cookies).some((k) => k.toLowerCase().includes('session'))
  );
}

async function fetchJson(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; body: any; headers: Record<string, string> }> {
  const res = await fetch(url, init);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });

  let body: any = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  return { ok: res.ok, status: res.status, body, headers };
}

function baseHeaders(cookieHeader: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Cookie: cookieHeader,
    Origin: UNLUCID_ORIGIN,
    Referer: `${UNLUCID_ORIGIN}/gems`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
}

function mapAuthFailure(status: number, message?: string): ProxyErrorCode {
  const msg = (message || '').toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('not signed in') ||
    msg.includes('sign in') ||
    msg.includes('unauthorized') ||
    msg.includes('session')
  ) {
    return 'SESSION_EXPIRED';
  }
  if (status === 409 || msg.includes('already claimed') || msg.includes('already claim')) {
    return 'ALREADY_CLAIMED';
  }
  return 'ERROR';
}

function resolveGems(accountBody: any): number {
  const user = accountBody?.user || {};
  return (
    (typeof accountBody?.gems === 'number' ? accountBody.gems : null) ??
    (typeof accountBody?.totalGems === 'number' ? accountBody.totalGems : null) ??
    (typeof user.gems === 'number' ? user.gems : null) ??
    (typeof user.totalGems === 'number' ? user.totalGems : null) ??
    0
  );
}

function normalizeProfile(
  accountBody: any,
  svelteData: any,
  cookies: Record<string, string>
): NormalizedProfile {
  const user = accountBody?.user || {};
  const claim = extractClaimData({
    ...accountBody,
    svelteData,
    user,
  });
  const meta = extractProfileMetadata({
    ...accountBody,
    svelteData,
    user,
  });

  const canClaim =
    claim.canClaimFreeGems ??
    (typeof accountBody?.canClaimFreeGems === 'boolean' ? accountBody.canClaimFreeGems : null) ??
    (typeof user.canClaimFreeGems === 'boolean' ? user.canClaimFreeGems : null) ??
    false;

  const nextFreeGemsAt =
    claim.nextFreeGemsAt ??
    (typeof accountBody?.nextFreeGemsAt === 'number' ? accountBody.nextFreeGemsAt : null) ??
    (typeof user.nextFreeGemsAt === 'number' ? user.nextFreeGemsAt : null) ??
    (canClaim ? Date.now() : Date.now() + 24 * 3600 * 1000);

  return {
    id: meta.id || user.id,
    name: meta.name || user.name || cookies.name,
    email: meta.email || user.email || cookies.gmail || cookies.email,
    image: meta.image || user.image,
    gems: resolveGems(accountBody),
    canClaimFreeGems: Boolean(canClaim),
    nextFreeGemsAt,
    referralCode: user.referralCode,
    referralCodeUses: user.referralCodeUses,
    referralLimit: user.referralLimit,
    referralReward: user.referralReward,
    isAdmin: Boolean(user.isAdmin ?? accountBody?.isAdmin),
    matureEnabled: Boolean(user.matureEnabled ?? accountBody?.matureEnabled),
    canApplyReferral: Boolean(user.canApplyReferral),
  };
}

export async function fetchAccount(cookies: Record<string, string>): Promise<AccountResult> {
  if (!cookies || typeof cookies !== 'object' || !hasSessionCookie(cookies)) {
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Missing session token',
      status: 400,
    };
  }

  const cookieHeader = toCookieHeader(cookies);
  if (!cookieHeader) {
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'No valid cookies to forward',
      status: 400,
    };
  }

  try {
    const [accountRes, gemsRes] = await Promise.all([
      fetchJson(`${UNLUCID_ORIGIN}/api/account`, {
        method: 'GET',
        headers: baseHeaders(cookieHeader),
      }),
      fetchJson(`${UNLUCID_ORIGIN}/gems/__data.json`, {
        method: 'GET',
        headers: baseHeaders(cookieHeader),
      }),
    ]);

    if (!accountRes.ok) {
      const message =
        accountRes.body?.message ||
        (accountRes.status === 401 ? 'Not signed in' : `Upstream ${accountRes.status}`);
      return {
        ok: false,
        code: mapAuthFailure(accountRes.status, message),
        message,
        status: accountRes.status,
      };
    }

    const accountBody = {
      ...accountRes.body,
      svelteData: gemsRes.ok ? gemsRes.body : undefined,
    };

    const profile = normalizeProfile(accountBody, gemsRes.ok ? gemsRes.body : null, cookies);

    return {
      ok: true,
      code: 'OK',
      status: 200,
      profile,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'UPSTREAM_ERROR',
      message: err instanceof Error ? err.message : 'Upstream request failed',
      status: 502,
    };
  }
}

export async function claimGems(cookies: Record<string, string>): Promise<ClaimResult> {
  if (!cookies || typeof cookies !== 'object' || !hasSessionCookie(cookies)) {
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Missing session token',
      status: 400,
    };
  }

  const cookieHeader = toCookieHeader(cookies);
  if (!cookieHeader) {
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'No valid cookies to forward',
      status: 400,
    };
  }

  try {
    // SvelteKit form action — requires same-origin Origin/Referer
    const claimUrl = `${UNLUCID_ORIGIN}/gems?/claim`;
    const claimRes = await fetchJson(claimUrl, {
      method: 'POST',
      headers: {
        ...baseHeaders(cookieHeader),
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-sveltekit-action': 'true',
      },
      body: '',
    });

    const rawMessage =
      claimRes.body?.data ||
      claimRes.body?.message ||
      claimRes.body?.error?.message ||
      '';

    let message = '';
    if (typeof rawMessage === 'string') {
      try {
        const parsed = JSON.parse(rawMessage);
        message = Array.isArray(parsed) ? String(parsed[1] || parsed[0] || '') : rawMessage;
      } catch {
        message = rawMessage;
      }
    } else if (rawMessage && typeof rawMessage === 'object') {
      message = rawMessage.message || JSON.stringify(rawMessage);
    }

    const svelteFailure = claimRes.body?.type === 'failure';
    const status = svelteFailure ? claimRes.body?.status || claimRes.status : claimRes.status;

    if (svelteFailure || !claimRes.ok || status >= 400) {
      const code = mapAuthFailure(status, message);
      return {
        ok: false,
        code,
        message: message || (code === 'ALREADY_CLAIMED' ? 'Already claimed' : 'Claim failed'),
        status: status || 400,
      };
    }

    // Refresh profile after successful claim
    const account = await fetchAccount(cookies);
    return {
      ok: true,
      code: 'OK',
      status: 200,
      message: 'Claimed successfully',
      profile: account.profile,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'UPSTREAM_ERROR',
      message: err instanceof Error ? err.message : 'Upstream request failed',
      status: 502,
    };
  }
}

export async function fetchAccountAndReadyClaim(
  cookies: Record<string, string>
): Promise<AccountResult> {
  return fetchAccount(cookies);
}

export async function batchFetchAccounts(
  items: BatchAccountItem[]
): Promise<{ results: Array<{ id: string } & AccountResult> }> {
  const limited = items.slice(0, 40);
  const results = await Promise.all(
    limited.map(async (item) => {
      const result = await fetchAccount(item.cookies || {});
      return { id: item.id, ...result };
    })
  );
  return { results };
}

/** Parse JSON body from Node IncomingMessage / Vite Connect req */
export async function readJsonBody(req: { on?: Function; body?: any }): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    if (typeof req.on !== 'function') {
      resolve({});
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
