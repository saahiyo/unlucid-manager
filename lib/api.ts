import { URL_ACCOUNT, URL_CLAIM, URL_BOTH, URL_BATCH } from '../config';
import type { UserData } from '../types';
import type { AccountResult, ClaimResult, NormalizedProfile, ProxyErrorCode } from '../server/unlucid-proxy';

export type { AccountResult, ClaimResult, NormalizedProfile, ProxyErrorCode };

function profileToUserData(profile: NormalizedProfile): UserData {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    image: profile.image,
    gems: profile.gems,
    totalGems: profile.gems,
    canClaimFreeGems: profile.canClaimFreeGems,
    nextFreeGemsAt: profile.nextFreeGemsAt,
    referralCode: profile.referralCode || 'N/A',
    referralCodeUses: profile.referralCodeUses || 0,
    referralLimit: profile.referralLimit || 0,
    referralReward: profile.referralReward || 0,
    isAdmin: profile.isAdmin,
    matureEnabled: profile.matureEnabled,
    canApplyReferral: profile.canApplyReferral,
    date: Date.now(),
  };
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const controller = signal ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), 25000)
    : null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal || controller!.signal,
    });

    const data = await res.json();
    return data as T;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function apiFetchAccount(
  cookies: Record<string, string>
): Promise<{ ok: true; data: UserData } | { ok: false; code: ProxyErrorCode; message: string }> {
  // Prefer /both (same as account on owned proxy) then /account
  let result: AccountResult | null = null;

  try {
    result = await postJson<AccountResult>(URL_BOTH, cookies);
  } catch {
    result = null;
  }

  if (!result || typeof result.ok !== 'boolean') {
    try {
      result = await postJson<AccountResult>(URL_ACCOUNT, cookies);
    } catch (err) {
      return {
        ok: false,
        code: 'UPSTREAM_ERROR',
        message: err instanceof Error ? err.message : 'Connection error',
      };
    }
  }

  if (!result.ok || !result.profile) {
    return {
      ok: false,
      code: result.code || 'ERROR',
      message: result.message || 'Failed to load account',
    };
  }

  return { ok: true, data: profileToUserData(result.profile) };
}

export async function apiClaimGems(
  cookies: Record<string, string>
): Promise<{ ok: true; data?: UserData; message?: string } | { ok: false; code: ProxyErrorCode; message: string }> {
  try {
    const result = await postJson<ClaimResult>(URL_CLAIM, cookies);

    if (!result.ok) {
      return {
        ok: false,
        code: result.code || 'ERROR',
        message: result.message || 'Claim failed',
      };
    }

    return {
      ok: true,
      message: result.message || 'Claimed successfully',
      data: result.profile ? profileToUserData(result.profile) : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'UPSTREAM_ERROR',
      message: err instanceof Error ? err.message : 'Connection error',
    };
  }
}

export async function apiBatchFetch(
  accounts: { id: string; cookies: Record<string, string> }[]
): Promise<Array<{ id: string; ok: boolean; data?: UserData; code?: ProxyErrorCode; message?: string }>> {
  try {
    const result = await postJson<{
      ok: boolean;
      results: Array<AccountResult & { id: string }>;
    }>(URL_BATCH, { accounts });

    return (result.results || []).map((r) => {
      if (r.ok && r.profile) {
        return { id: r.id, ok: true, data: profileToUserData(r.profile) };
      }
      return {
        id: r.id,
        ok: false,
        code: r.code,
        message: r.message || 'Failed',
      };
    });
  } catch {
    // Fallback: parallel individual fetches
    return Promise.all(
      accounts.map(async (a) => {
        const r = await apiFetchAccount(a.cookies);
        if (r.ok) return { id: a.id, ok: true, data: r.data };
        return { id: a.id, ok: false, code: r.code, message: r.message };
      })
    );
  }
}
