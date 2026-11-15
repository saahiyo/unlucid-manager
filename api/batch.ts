import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  batchFetchAccounts,
  handleOptions,
  jsonResponse,
} from '../server/unlucid-proxy';

/**
 * POST { accounts: [{ id, cookies }] }
 * Returns { results: [{ id, ok, code, profile?, message? }] }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || null;

  if (req.method === 'OPTIONS') {
    const out = handleOptions(origin);
    res.status(out.status);
    Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.end();
  }

  if (req.method !== 'POST') {
    const out = jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'POST only' }, 405, origin);
    res.status(out.status);
    Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.send(out.body);
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const accounts = Array.isArray(body.accounts) ? body.accounts : [];
    if (accounts.length === 0) {
      const out = jsonResponse(
        { ok: false, code: 'INVALID_REQUEST', message: 'accounts array required' },
        400,
        origin
      );
      res.status(out.status);
      Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.send(out.body);
    }

    const result = await batchFetchAccounts(
      accounts.map((a: any) => ({
        id: String(a.id || a.name || ''),
        cookies: a.cookies || {},
      }))
    );

    const out = jsonResponse({ ok: true, ...result }, 200, origin);
    res.status(out.status);
    Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.send(out.body);
  } catch (err) {
    const out = jsonResponse(
      {
        ok: false,
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Server error',
      },
      500,
      origin
    );
    res.status(out.status);
    Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.send(out.body);
  }
}
