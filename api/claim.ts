import {
  claimGems,
  handleOptions,
  jsonResponse,
  toWebResponse,
} from '../server/unlucid-proxy';

export const config = { runtime: 'edge' };

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
    const cookies = await req.json().catch(() => ({}));
    const result = await claimGems(cookies || {});
    return toWebResponse(jsonResponse(result, result.ok ? 200 : result.status || 400, origin));
  } catch (err) {
    return toWebResponse(
      jsonResponse(
        {
          ok: false,
          code: 'ERROR',
          message: err instanceof Error ? err.message : 'Server error',
          status: 500,
        },
        500,
        origin
      )
    );
  }
}
