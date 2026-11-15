/**
 * Example only — cookies now live in VITE_COOKIES / localStorage.
 * API routes point at the owned proxy by default (see config.ts).
 */
export const COOKIES_EXAMPLE = {
  my_account: {
    gmail: "you@gmail.com",
    "__Secure-authjs.callback-url": "https://unlucid.ai/",
    "__Secure-authjs.session-token": "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhT..."
  }
};

// Owned proxy (same-origin). Override with VITE_API_BASE if needed.
export const URL_ACCOUNT = '/api/account';
export const URL_CLAIM = '/api/claim';
export const URL_BOTH = '/api/both';
export const URL_BATCH = '/api/batch';
