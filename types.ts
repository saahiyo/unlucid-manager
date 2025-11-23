export interface UserData {
  date: number;
  id: string;
  email: string;
  name: string;
  matureEnabled: boolean;
  gems: number;
  nextFreeGemsAt: number;
  canApplyReferral: boolean;
  referralCode: string;
  referralCodeUses: number;
  referralLimit: number;
  referralReward: number;
}

export interface AccountResponse {
  account: {
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    body: {
      user: UserData;
    };
  };
}

export interface ProfileConfig {
  name: string;
  cookies: Record<string, string>;
}

export interface ProfileState {
  id: string;
  config: ProfileConfig;
  data: UserData | null;
  status: 'idle' | 'loading' | 'claiming' | 'success' | 'error';
  message?: string;
  lastUpdated?: number;
}

// For the raw cookies.json input
export interface RawCookiesJson {
  [key: string]: Record<string, string>;
}
