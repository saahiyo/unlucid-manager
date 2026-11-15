/**
 * API base — empty string = same origin (owned proxy via Vite middleware / Vercel /api).
 * Override with VITE_API_BASE if the proxy is hosted separately.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';

export const URL_ACCOUNT = `${API_BASE}/api/account`;
export const URL_CLAIM = `${API_BASE}/api/claim`;
export const URL_BOTH = `${API_BASE}/api/both`;
export const URL_BATCH = `${API_BASE}/api/batch`;
