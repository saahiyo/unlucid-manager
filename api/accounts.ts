import {
  handleOptions,
  jsonResponse,
  toWebResponse,
} from '../server/unlucid-proxy';
import {
  authorizeSyncRequest,
  deleteRemoteAccount,
  hasRemoteStore,
  readRemoteAccounts,
  replaceRemoteAccounts,
  upsertRemoteAccount,
} from '../server/remote-accounts';

export const config = { runtime: 'edge' };

/**
 * Dashboard → server cookie sync for cron.
 * POST JSON:
 *   { op: 'upsert', account: { id, email?, label?, cookies } }
 *   { op: 'delete', id }
 *   { op: 'replace', accounts: [...] }
 *   { op: 'list' }
 * Auth: Authorization: Bearer <SYNC_SECRET|CRON_SECRET>
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

  const auth = authorizeSyncRequest(req);
  if (auth.ok === false) {
    return toWebResponse(
      jsonResponse(
        { ok: false, code: auth.status === 401 ? 'INVALID_REQUEST' : 'ERROR', message: auth.message },
        auth.status,
        origin
      )
    );
  }

  if (!hasRemoteStore()) {
    return toWebResponse(
      jsonResponse(
        {
          ok: false,
          code: 'ERROR',
          message:
            'Remote store not configured. Connect Upstash Redis / KV to this project (KV_REST_API_URL + KV_REST_API_TOKEN).',
        },
        503,
        origin
      )
    );
  }

  try {
    if (req.method === 'GET') {
      const map = await readRemoteAccounts();
      return toWebResponse(
        jsonResponse({ ok: true, accounts: Object.values(map), count: Object.keys(map).length }, 200, origin)
      );
    }

    const body = await req.json().catch(() => ({}));
    const op = String(body?.op || 'list');

    if (op === 'list') {
      const map = await readRemoteAccounts();
      return toWebResponse(
        jsonResponse({ ok: true, accounts: Object.values(map), count: Object.keys(map).length }, 200, origin)
      );
    }

    if (op === 'upsert') {
      const account = body?.account;
      if (!account?.id || !account?.cookies || typeof account.cookies !== 'object') {
        return toWebResponse(
          jsonResponse(
            { ok: false, code: 'INVALID_REQUEST', message: 'account.id and account.cookies required' },
            400,
            origin
          )
        );
      }
      const saved = await upsertRemoteAccount({
        id: String(account.id),
        email: account.email ? String(account.email) : undefined,
        label: account.label ? String(account.label) : undefined,
        cookies: account.cookies,
      });
      return toWebResponse(jsonResponse({ ok: true, account: saved }, 200, origin));
    }

    if (op === 'delete') {
      const id = String(body?.id || '');
      if (!id) {
        return toWebResponse(
          jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'id required' }, 400, origin)
        );
      }
      const removed = await deleteRemoteAccount(id);
      return toWebResponse(jsonResponse({ ok: true, removed }, 200, origin));
    }

    if (op === 'replace') {
      const accounts = Array.isArray(body?.accounts) ? body.accounts : [];
      const saved = await replaceRemoteAccounts(accounts);
      return toWebResponse(
        jsonResponse({ ok: true, accounts: saved, count: saved.length }, 200, origin)
      );
    }

    return toWebResponse(
      jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: `Unknown op: ${op}` }, 400, origin)
    );
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
