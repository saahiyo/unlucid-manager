import {
  authorizeCronRequest,
  handleOptions,
  jsonResponse,
  runAutoClaim,
  toWebResponse,
} from '../../server/unlucid-proxy';
import { loadCronAccounts } from '../../server/remote-accounts';

export const config = { runtime: 'edge' };

/**
 * Server-side auto-claim for Vercel Cron (and manual triggers).
 * Prefers dashboard-synced remote store, then env cookies.
 * GET or POST with Authorization: Bearer <CRON_SECRET>
 */
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return toWebResponse(handleOptions(origin));
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return toWebResponse(
      jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'GET or POST only' }, 405, origin)
    );
  }

  const auth = authorizeCronRequest(req);
  if (auth.ok === false) {
    return toWebResponse(
      jsonResponse(
        { ok: false, code: auth.status === 401 ? 'INVALID_REQUEST' : 'ERROR', message: auth.message },
        auth.status,
        origin
      )
    );
  }

  try {
    const { accounts, source } = await loadCronAccounts();
    if (accounts.length === 0) {
      return toWebResponse(
        jsonResponse(
          {
            ok: false,
            code: 'INVALID_REQUEST',
            message:
              'No accounts in remote store or env. Update cookies in the dashboard (with sync configured) or set UNLUCID_COOKIES.',
            source,
            claimed: 0,
            skipped: 0,
            failed: 0,
            total: 0,
            results: [],
          },
          400,
          origin
        )
      );
    }

    const summary = await runAutoClaim(accounts);
    return toWebResponse(jsonResponse({ ...summary, source }, 200, origin));
  } catch (err) {
    return toWebResponse(
      jsonResponse(
        {
          ok: false,
          code: 'ERROR',
          message: err instanceof Error ? err.message : 'Server error',
          claimed: 0,
          skipped: 0,
          failed: 0,
          total: 0,
          results: [],
        },
        500,
        origin
      )
    );
  }
}
