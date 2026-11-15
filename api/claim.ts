import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  claimGems,
  handleOptions,
  jsonResponse,
} from '../server/unlucid-proxy';

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
    const cookies = typeof req.body === 'object' && req.body ? req.body : {};
    const result = await claimGems(cookies);
    const out = jsonResponse(result, result.ok ? 200 : result.status || 400, origin);
    res.status(out.status);
    Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.send(out.body);
  } catch (err) {
    const out = jsonResponse(
      {
        ok: false,
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Server error',
        status: 500,
      },
      500,
      origin
    );
    res.status(out.status);
    Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.send(out.body);
  }
}
