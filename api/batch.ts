import {
  batchFetchAccounts,
  handleOptions,
  jsonResponse,
  toWebResponse,
} from '../server/unlucid-proxy';

export const config = { runtime: 'edge' };

/**
 * POST { accounts: [{ id, cookies }] }
 * Returns { results: [{ id, ok, code, profile?, message? }] }
 */
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return toWebResponse(handleOptions(origin));
  }

  if (req.method !== 'POST') {
    return toWebResponse(
      jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'POST only' }, 405, origin)
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const accounts = Array.isArray(body?.accounts) ? body.accounts : [];
    if (accounts.length === 0) {
      return toWebResponse(
        jsonResponse(
          { ok: false, code: 'INVALID_REQUEST', message: 'accounts array required' },
          400,
          origin
        )
      );
    }

    const result = await batchFetchAccounts(
      accounts.map((a: { id?: string; name?: string; cookies?: Record<string, string> }) => ({
        id: String(a.id || a.name || ''),
        cookies: a.cookies || {},
      }))
    );

    return toWebResponse(jsonResponse({ ok: true, ...result }, 200, origin));
  } catch (err) {
    return toWebResponse(
      jsonResponse(
        {
          ok: false,
          code: 'ERROR',
          message: err instanceof Error ? err.message : 'Server error',
        },
        500,
        origin
      )
    );
  }
}
