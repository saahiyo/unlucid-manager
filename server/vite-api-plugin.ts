import type { Plugin } from 'vite';
import {
  authorizeCronRequest,
  batchFetchAccounts,
  claimGems,
  fetchAccount,
  handleOptions,
  jsonResponse,
  loadCronAccountsFromEnv,
  runAutoClaim,
} from './unlucid-proxy';

function send(
  res: any,
  out: { status: number; headers: Record<string, string>; body: string }
) {
  res.statusCode = out.status;
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(out.body);
}

/** Parse JSON body from Vite Connect IncomingMessage */
async function readJsonBody(req: { on?: Function; body?: any }): Promise<any> {
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

/**
 * Local Vite middleware so /api/* works during `npm run dev`
 * without needing `vercel dev`.
 */
export function unlucidApiPlugin(): Plugin {
  return {
    name: 'unlucid-owned-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (!url.startsWith('/api/')) return next();

        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;

        if (req.method === 'OPTIONS') {
          return send(res, handleOptions(origin));
        }

        try {
          if (url === '/api/account' || url === '/api/both') {
            if (req.method !== 'POST') {
              return send(res, jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'POST only' }, 405, origin));
            }
            const body = await readJsonBody(req);
            const result = await fetchAccount(body || {});
            return send(res, jsonResponse(result, result.ok ? 200 : result.status || 400, origin));
          }

          if (url === '/api/claim') {
            if (req.method !== 'POST') {
              return send(res, jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'POST only' }, 405, origin));
            }
            const body = await readJsonBody(req);
            const result = await claimGems(body || {});
            return send(res, jsonResponse(result, result.ok ? 200 : result.status || 400, origin));
          }

          if (url === '/api/batch') {
            if (req.method !== 'POST') {
              return send(res, jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'POST only' }, 405, origin));
            }
            const body = await readJsonBody(req);
            const accounts = Array.isArray(body?.accounts) ? body.accounts : [];
            if (accounts.length === 0) {
              return send(
                res,
                jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'accounts array required' }, 400, origin)
              );
            }
            const result = await batchFetchAccounts(
              accounts.map((a: any) => ({
                id: String(a.id || a.name || ''),
                cookies: a.cookies || {},
              }))
            );
            return send(res, jsonResponse({ ok: true, ...result }, 200, origin));
          }

          if (url === '/api/cron/auto-claim') {
            if (req.method !== 'GET' && req.method !== 'POST') {
              return send(
                res,
                jsonResponse({ ok: false, code: 'INVALID_REQUEST', message: 'GET or POST only' }, 405, origin)
              );
            }

            const host = req.headers.host || 'localhost';
            const proto = host.includes('localhost') ? 'http' : 'https';
            const authReq = new Request(`${proto}://${host}${req.url}`, {
              method: req.method,
              headers: req.headers as HeadersInit,
            });
            const auth = authorizeCronRequest(authReq);
            if (auth.ok === false) {
              return send(
                res,
                jsonResponse(
                  {
                    ok: false,
                    code: auth.status === 401 ? 'INVALID_REQUEST' : 'ERROR',
                    message: auth.message,
                  },
                  auth.status,
                  origin
                )
              );
            }

            const accounts = loadCronAccountsFromEnv();
            if (accounts.length === 0) {
              return send(
                res,
                jsonResponse(
                  {
                    ok: false,
                    code: 'INVALID_REQUEST',
                    message: 'No accounts in UNLUCID_COOKIES or VITE_COOKIES',
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
            return send(res, jsonResponse(summary, 200, origin));
          }

          return next();
        } catch (err) {
          return send(
            res,
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
      });
    },
  };
}
