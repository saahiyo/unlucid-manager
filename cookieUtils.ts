/**
 * Utility functions for parsing and handling Unlucid session cookies and tokens.
 * Supports:
 * - Direct session tokens (Better-Auth or Auth.js)
 * - Raw cookie strings (e.g., '__Secure-better-auth.session_token=...; __Secure-authjs.session-token=...')
 * - Full curl commands copied from DevTools (curl -b '...' / -H 'cookie: ...')
 * - JSON cookie objects
 */

export function parseCookiesInput(input: string): Record<string, string> {
  const trimmed = input.trim();
  if (!trimmed) return {};

  // Case 1: JSON formatted input
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') {
            result[k] = v;
          } else if (typeof v === 'object' && v !== null) {
            // Flatten nested object if user pasted { "name": { "cookie": "val" } }
            Object.assign(result, v);
          }
        }
        if (Object.keys(result).length > 0) return result;
      }
    } catch (e) {
      // Continue to next parsers
    }
  }

  // Case 2: Extract cookie string from curl commands
  let cookieString = trimmed;
  const curlCookieMatch = 
    trimmed.match(/-b\s+['"]([^'"]+)['"]/i) || 
    trimmed.match(/--cookie\s+['"]([^'"]+)['"]/i) ||
    trimmed.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i);
  
  if (curlCookieMatch && curlCookieMatch[1]) {
    cookieString = curlCookieMatch[1];
  }

  // Case 3: Semicolon-delimited cookies ('key1=val1; key2=val2')
  if (cookieString.includes('=') && (cookieString.includes(';') || cookieString.includes('__Secure-'))) {
    const cookies: Record<string, string> = {};
    const parts = cookieString.split(';');
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        const key = part.slice(0, eqIdx).trim();
        let val = part.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1).trim();
        }
        if (key && val) {
          cookies[key] = val;
        }
      }
    }
    if (Object.keys(cookies).length > 0) {
      return cookies;
    }
  }

  // Case 4: Standalone token (Better-Auth or Auth.js)
  let cleanToken = trimmed;
  if ((cleanToken.startsWith('"') && cleanToken.endsWith('"')) || (cleanToken.startsWith("'") && cleanToken.endsWith("'"))) {
    cleanToken = cleanToken.slice(1, -1).trim();
  }
  if (cleanToken.toLowerCase().startsWith('bearer ')) {
    cleanToken = cleanToken.slice(7).trim();
  }

  // If token is Auth.js JWT (starts with eyJ...)
  if (cleanToken.startsWith('eyJ')) {
    return {
      "__Secure-authjs.session-token": cleanToken
    };
  }

  // Otherwise, it's a Better-Auth token (e.g. starts with Bs9IM... or custom string)
  // We attach both keys to ensure backward and forward compatibility with unlucid API
  return {
    "__Secure-better-auth.session_token": cleanToken,
    "__Secure-authjs.session-token": cleanToken
  };
}

export function getPrimaryToken(cookies: Record<string, string> = {}): string {
  return (
    cookies["__Secure-better-auth.session_token"] ||
    cookies["__Secure-authjs.session-token"] ||
    Object.values(cookies)[0] ||
    ""
  );
}

export function formatCookiesDisplay(cookies: Record<string, string> = {}): string {
  const betterAuth = cookies["__Secure-better-auth.session_token"];
  const authJs = cookies["__Secure-authjs.session-token"];
  if (betterAuth && authJs && betterAuth !== authJs) {
    return `better-auth: ${betterAuth.slice(0, 16)}... | authjs: ${authJs.slice(0, 16)}...`;
  }
  return getPrimaryToken(cookies);
}

export interface ExtractedProfile {
  name?: string;
  email?: string;
  image?: string;
  id?: string;
}

export function extractProfileMetadata(payload: any): ExtractedProfile {
  if (!payload) return {};

  const profile: ExtractedProfile = {};

  // Helper to extract from SvelteKit devalue arrays
  function tryExtractSvelteKit(data: any) {
    if (!data) return;
    let arr: any[] | null = null;
    if (Array.isArray(data)) {
      arr = data;
    } else if (data.nodes && Array.isArray(data.nodes)) {
      for (const node of data.nodes) {
        if (node && Array.isArray(node.data)) {
          arr = node.data;
          break;
        }
      }
    } else if (data.data && Array.isArray(data.data)) {
      arr = data.data;
    }

    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          if ('name' in item || 'email' in item) {
            const nameIdx = typeof item.name === 'number' ? item.name : -1;
            const emailIdx = typeof item.email === 'number' ? item.email : -1;
            const imageIdx = typeof item.image === 'number' ? item.image : -1;
            const idIdx = typeof item.id === 'number' ? item.id : -1;

            if (nameIdx >= 0 && typeof arr[nameIdx] === 'string') profile.name = arr[nameIdx];
            if (emailIdx >= 0 && typeof arr[emailIdx] === 'string') profile.email = arr[emailIdx];
            if (imageIdx >= 0 && typeof arr[imageIdx] === 'string') profile.image = arr[imageIdx];
            if (idIdx >= 0 && typeof arr[idIdx] === 'string') profile.id = arr[idIdx];

            return;
          }
        }
      }
    }
  }

  // 1. Direct object inspection or nested SvelteKit data
  if (typeof payload === 'object' && payload !== null) {
    if (payload.svelteData) tryExtractSvelteKit(payload.svelteData);
    if (payload.account?.body?.svelteData) tryExtractSvelteKit(payload.account.body.svelteData);
    if (payload.profile?.body) tryExtractSvelteKit(payload.profile.body);
    if (payload.body?.svelteData) tryExtractSvelteKit(payload.body.svelteData);
    if (payload.nodes) tryExtractSvelteKit(payload);

    if (profile.name && profile.email) return profile;

    const user = payload.user || payload;
    if (typeof user.name === 'string' && user.name) profile.name = user.name;
    if (typeof user.email === 'string' && user.email) profile.email = user.email;
    if (typeof user.image === 'string' && user.image) profile.image = user.image;
    if (typeof user.id === 'string' && user.id) profile.id = user.id;

    if (profile.name && profile.email) return profile;
  }

  // 2. Convert to string for regex searching across HTML/JSON strings
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (!profile.name) {
    const nameMatch = 
      raw.match(/user:\s*\{[^}]*?name:\s*"([^"]+)"/) || 
      raw.match(/"name"\s*:\s*"([^"]+)"/) ||
      raw.match(/name:\s*"([^"]+)"/);
    if (nameMatch && nameMatch[1] && nameMatch[1] !== 'unlucid.ai') {
      profile.name = nameMatch[1];
    }
  }

  if (!profile.email) {
    const emailMatch = 
      raw.match(/email:\s*"([^"]+)"/) || 
      raw.match(/"email"\s*:\s*"([^"]+)"/) ||
      raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && emailMatch[1]) {
      profile.email = emailMatch[1];
    }
  }

  if (!profile.image) {
    const imageMatch = 
      raw.match(/image:\s*"([^"]+)"/) || 
      raw.match(/"image"\s*:\s*"([^"]+)"/);
    if (imageMatch && imageMatch[1]) {
      profile.image = imageMatch[1];
    }
  }

  if (!profile.id) {
    const idMatch = 
      raw.match(/id:\s*"([0-9a-fA-F-]{20,})/) || 
      raw.match(/"id"\s*:\s*"([0-9a-fA-F-]{20,})/);
    if (idMatch && idMatch[1]) {
      profile.id = idMatch[1];
    }
  }

  return profile;
}

