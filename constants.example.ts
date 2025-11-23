import { RawCookiesJson } from './types';

// Example cookies structure - DO NOT COMMIT REAL TOKENS
export const DEFAULT_COOKIES: RawCookiesJson = {
    "example_profile": {
        "gmail": "user@example.com",
        "__Secure-authjs.callback-url": "https://unlucid.ai/",
        "__Secure-authjs.session-token": "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhT..."
    }
};

export const URL_ACCOUNT = 'https://unlucid-prox.vercel.app/api/account';
export const URL_CLAIM = 'https://unlucid-prox.vercel.app/api/claim';
