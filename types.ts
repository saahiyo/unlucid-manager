export interface UserData {
  date?: number;
  id?: string;
  email?: string;
  name?: string;
  image?: string;
  matureEnabled?: boolean;
  gems: number;
  totalGems?: number;
  nextFreeGemsAt: number;
  canClaimFreeGems?: boolean;
  canApplyReferral?: boolean;
  referralCode?: string;
  referralCodeUses?: number;
  referralLimit?: number;
  referralReward?: number;
  isAdmin?: boolean;
}

export interface AccountResponse {
  account: {
    ok: boolean;
    status: number;
    headers?: Record<string, string>;
    body: {
      user?: Partial<UserData>;
      totalGems?: number;
      gems?: number;
      matureEnabled?: boolean;
      isAdmin?: boolean;
      canClaimFreeGems?: boolean;
      message?: string;
      [key: string]: any;
    };
  };
  claim?: {
    ok: boolean;
    status: number;
    headers?: Record<string, string>;
    body?: any;
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
