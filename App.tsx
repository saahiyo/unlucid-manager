import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProfileState, RawCookiesJson } from './types';
import { URL_ACCOUNT, URL_CLAIM, URL_BOTH } from './config';
import { AccountCard } from './components/AccountCard';
import { ThemeProvider } from './components/ThemeProvider';
import { ThemeToggle } from './components/ThemeToggle';

import { Diamond, Layers, LogOut, RefreshCw, Zap, Import, Download, Sparkles, Volume2, VolumeX, Plus } from 'lucide-react';

import { DrawingCursor } from './components/DrawingCursor';
import { Preloader } from './components/Preloader';
import { CookieImportModal } from './components/CookieImportModal';
import { AddAccountModal } from './components/AddAccountModal';
import { parseCookiesInput, getPrimaryToken, extractProfileMetadata } from './cookieUtils';

function App() {
  const [profiles, setProfiles] = useState<ProfileState[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Hands-free Auto-Claimer State
  const [autoClaimEnabled, setAutoClaimEnabled] = useState(() => {
    return localStorage.getItem('unlucid_auto_claim') === 'true';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('unlucid_sound_enabled') !== 'false';
  });
  const [autoClaimCount, setAutoClaimCount] = useState<number>(0);

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const isAutoClaimingRef = useRef(false);

  // Initialize with cookies from Env Var and LocalStorage
  useEffect(() => {
    const loadAllCookies = () => {
      let combinedCookies: RawCookiesJson = {};

      // 1. Load from Env
      try {
        const cookiesEnv = import.meta.env.VITE_COOKIES;
        if (cookiesEnv) {
          const parsedEnv = JSON.parse(cookiesEnv);
          combinedCookies = { ...combinedCookies, ...parsedEnv };
        }
      } catch (e) {
        console.error('Failed to parse VITE_COOKIES', e);
      }

      // 2. Load from LocalStorage
      try {
        const localCookies = localStorage.getItem('unlucid_imported_cookies');
        if (localCookies) {
          const parsedLocal = JSON.parse(localCookies);
          combinedCookies = { ...combinedCookies, ...parsedLocal };
        }
      } catch (e) {
        console.error('Failed to parse local cookies', e);
      }

      // 3. Filter out deleted accounts
      try {
        const deletedRaw = localStorage.getItem('unlucid_deleted_accounts');
        if (deletedRaw) {
          const deletedAccounts: string[] = JSON.parse(deletedRaw);
          deletedAccounts.forEach(delKey => {
            delete combinedCookies[delKey];
          });
        }
      } catch (e) {
        console.error('Failed to parse deleted accounts', e);
      }

      if (Object.keys(combinedCookies).length > 0) {
        handleLoadCookies(combinedCookies);
      } else {
        // console.warn('No cookies found.');
        setInitialLoading(false);
      }
    };

    loadAllCookies();
  }, []);

  const handleSaveImportedCookies = (importedAccounts: { name: string; token: string }[]) => {
    // Convert array to RawCookiesJson format using universal parser
    const newCookies: RawCookiesJson = {};
    const importedNames: string[] = [];
    importedAccounts.forEach(acc => {
      newCookies[acc.name] = parseCookiesInput(acc.token);
      importedNames.push(acc.name);
    });

    // Unmark imported names from deleted accounts if any
    try {
      const deletedRaw = localStorage.getItem('unlucid_deleted_accounts');
      if (deletedRaw) {
        let deletedList: string[] = JSON.parse(deletedRaw);
        deletedList = deletedList.filter(d => !importedNames.includes(d));
        localStorage.setItem('unlucid_deleted_accounts', JSON.stringify(deletedList));
      }
    } catch (e) {}

    // Save to LocalStorage
    localStorage.setItem('unlucid_imported_cookies', JSON.stringify(newCookies));

    // Merge with Env cookies and reload
    let combinedCookies: RawCookiesJson = { ...newCookies };
    try {
        const cookiesEnv = import.meta.env.VITE_COOKIES;
        if (cookiesEnv) {
             const parsedEnv = JSON.parse(cookiesEnv);
             combinedCookies = { ...parsedEnv, ...combinedCookies };
        }
    } catch(e) {}
    
    // Filter deleted accounts
    try {
      const deletedRaw = localStorage.getItem('unlucid_deleted_accounts');
      if (deletedRaw) {
        const deletedAccounts: string[] = JSON.parse(deletedRaw);
        deletedAccounts.forEach(delKey => {
          delete combinedCookies[delKey];
        });
      }
    } catch (e) {}

    handleLoadCookies(combinedCookies);
  };

  const handleUpdateAccount = async (oldId: string, newName: string, newToken: string) => {
    const trimmedName = newName.trim();
    const trimmedToken = newToken.trim();
    if (!trimmedName || !trimmedToken) return;

    // Load existing local storage cookies
    let localCookies: RawCookiesJson = {};
    try {
      const stored = localStorage.getItem('unlucid_imported_cookies');
      if (stored) {
        localCookies = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse local cookies', e);
    }

    // Preserve any existing cookies (e.g. gmail or other fields)
    const existingProfile = profiles.find(p => p.id === oldId);
    const existingCookies = existingProfile?.config.cookies || localCookies[oldId] || {};

    if (oldId !== trimmedName) {
      delete localCookies[oldId];
      // Mark oldId as deleted if it was originally loaded from env so it doesn't reappear
      try {
        const deletedRaw = localStorage.getItem('unlucid_deleted_accounts');
        const deletedList: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
        if (!deletedList.includes(oldId)) {
          deletedList.push(oldId);
          localStorage.setItem('unlucid_deleted_accounts', JSON.stringify(deletedList));
        }
      } catch (e) {}
    }

    // Unmark new name from deleted accounts if it was previously marked
    try {
      const deletedRaw = localStorage.getItem('unlucid_deleted_accounts');
      if (deletedRaw) {
        let deletedList: string[] = JSON.parse(deletedRaw);
        deletedList = deletedList.filter(d => d !== trimmedName);
        localStorage.setItem('unlucid_deleted_accounts', JSON.stringify(deletedList));
      }
    } catch (e) {}

    const parsedCookies = parseCookiesInput(trimmedToken);
    const updatedCookiesRecord = {
      ...existingCookies,
      ...parsedCookies
    };
    localCookies[trimmedName] = updatedCookiesRecord;

    localStorage.setItem('unlucid_imported_cookies', JSON.stringify(localCookies));

    // Update profiles state
    setProfiles(prev => {
      return prev.map(p => {
        if (p.id === oldId) {
          return {
            ...p,
            id: trimmedName,
            config: {
              name: trimmedName,
              cookies: updatedCookiesRecord
            },
            status: 'loading',
            message: undefined
          };
        }
        return p;
      });
    });

    // Auto-fetch fresh data for updated credentials
    await fetchAccountData(trimmedName, updatedCookiesRecord);
  };

  const handleDeleteAccount = (id: string) => {
    // 1. Remove from local storage
    try {
      const stored = localStorage.getItem('unlucid_imported_cookies');
      if (stored) {
        const localCookies = JSON.parse(stored);
        delete localCookies[id];
        localStorage.setItem('unlucid_imported_cookies', JSON.stringify(localCookies));
      }
    } catch (e) {
      console.error('Failed to parse local cookies', e);
    }

    // 2. Mark as deleted so env does not restore it
    try {
      const deletedRaw = localStorage.getItem('unlucid_deleted_accounts');
      const deletedList: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
      if (!deletedList.includes(id)) {
        deletedList.push(id);
        localStorage.setItem('unlucid_deleted_accounts', JSON.stringify(deletedList));
      }
    } catch (e) {}

    // 3. Update profiles state
    setProfiles(prev => prev.filter(p => p.id !== id));
  };

  const suggestedAccountName = useMemo(() => {
    let count = profiles.length + 1;
    while (profiles.some(p => p.config.name.toLowerCase() === `account ${count}`.toLowerCase())) {
      count++;
    }
    return `Account ${count}`;
  }, [profiles]);

  const existingAccountNames = useMemo(() => {
    return profiles.map(p => p.config.name);
  }, [profiles]);

  const handleAddAccount = async (name: string, token: string) => {
    const trimmedName = name.trim();
    const trimmedToken = token.trim();
    if (!trimmedName || !trimmedToken) return;

    let localCookies: RawCookiesJson = {};
    try {
      const stored = localStorage.getItem('unlucid_imported_cookies');
      if (stored) {
        localCookies = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse local cookies', e);
    }

    // Unmark from deleted accounts
    try {
      const deletedRaw = localStorage.getItem('unlucid_deleted_accounts');
      if (deletedRaw) {
        let deletedList: string[] = JSON.parse(deletedRaw);
        deletedList = deletedList.filter(d => d !== trimmedName);
        localStorage.setItem('unlucid_deleted_accounts', JSON.stringify(deletedList));
      }
    } catch (e) {}

    const newCookiesRecord = parseCookiesInput(trimmedToken);
    localCookies[trimmedName] = newCookiesRecord;
    localStorage.setItem('unlucid_imported_cookies', JSON.stringify(localCookies));

    const newProfile: ProfileState = {
      id: trimmedName,
      config: {
        name: trimmedName,
        cookies: newCookiesRecord
      },
      data: null,
      status: 'loading'
    };

    setProfiles(prev => [newProfile, ...prev]);

    await fetchAccountData(trimmedName, newCookiesRecord);
  };

  const getImportedCookiesForModal = () => {
      try {
          const localCookies = localStorage.getItem('unlucid_imported_cookies');
          if (localCookies) {
              const parsed = JSON.parse(localCookies);
              return Object.entries(parsed).map(([name, cookies]: [string, any]) => ({
                  name,
                  token: typeof cookies === 'string' ? cookies : getPrimaryToken(cookies)
              }));
          }
      } catch (e) {}
      return [];
  };

  const handleExportCookies = () => {
    const exportData: RawCookiesJson = {};
    profiles.forEach(p => {
        exportData[p.config.name] = p.config.cookies;
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "unlucid_cookies_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleLoadCookies = async (data: RawCookiesJson) => {
    const newProfiles: ProfileState[] = Object.entries(data).map(([key, cookies]) => ({
      id: key,
      config: { name: key, cookies },
      data: null,
      status: 'idle'
    }));
    setProfiles(newProfiles);
    // Automatically fetch data for new profiles
    await Promise.all(newProfiles.map(p => fetchAccountData(p.id, p.config.cookies)));
    setInitialLoading(false);
  };

  const fetchAccountData = async (id: string, cookies?: Record<string, string>) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'loading', message: undefined } : p));
    
    const profile = profiles.find(p => p.id === id);
    const currentCookies = { ...(cookies || profile?.config.cookies) };

    if (!currentCookies || Object.keys(currentCookies).length === 0) return;

    try {
      let result: AccountResponse | null = null;

      // 1. Try URL_BOTH first: fetches account gems & SvelteKit profile (name, email, avatar) in one call
      try {
        const bothResponse = await fetch(URL_BOTH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentCookies)
        });
        if (bothResponse.ok) {
          result = await bothResponse.json();
        }
      } catch (bothErr) {
        console.warn(`URL_BOTH unavailable for ${id}, falling back to URL_ACCOUNT`, bothErr);
      }

      // 2. Fallback to URL_ACCOUNT if URL_BOTH didn't return a valid response
      if (!result || !result.account) {
        const accountResponse = await fetch(URL_ACCOUNT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentCookies)
        });

        if (!accountResponse.ok) throw new Error(`HTTP ${accountResponse.status}`);
        result = await accountResponse.json();
      }
      
      if (!result || !result.account) {
        throw new Error('Invalid response');
      }

      if (!result.account.ok) {
        const errorMsg = result.account.body?.message || `HTTP ${result.account.status || 401}`;
        throw new Error(errorMsg);
      }

      const body = result.account.body || {};
      const userObj = body.user || body;
      const totalGems = userObj.totalGems ?? userObj.gems ?? 0;
      const canClaim = Boolean(userObj.canClaimFreeGems);
      const nextFreeGemsAt = userObj.nextFreeGemsAt || (canClaim ? Date.now() : Date.now() + 3600000);

      // Extract user metadata (real Google display name, Gmail address, Google avatar)
      const extractedMeta = extractProfileMetadata(
        result.account?.body?.svelteData ||
        result.account?.body ||
        result.claim?.body ||
        result
      );
      const resolvedName = extractedMeta.name || userObj.name || (profile?.config.name || id);
      const resolvedEmail = extractedMeta.email || userObj.email || currentCookies['gmail'] || '';
      const resolvedImage = extractedMeta.image || userObj.image || '';

      // Auto-save the fetched Gmail and Name into cookies and localStorage so export & persistence keep it
      if (resolvedEmail && currentCookies['gmail'] !== resolvedEmail) {
        currentCookies['gmail'] = resolvedEmail;
      }
      if (resolvedName && currentCookies['name'] !== resolvedName) {
        currentCookies['name'] = resolvedName;
      }

      const isGeneric = /^account \d+$/i.test(profile?.config.name || '') || /^account \d+$/i.test(id);
      const finalConfigName = isGeneric && resolvedName ? resolvedName : (profile?.config.name || id);

      try {
        const stored = localStorage.getItem('unlucid_imported_cookies');
        if (stored) {
          const parsed = JSON.parse(stored);
          const targetKey = parsed[id] ? id : Object.keys(parsed).find(k => k === id || k.toLowerCase() === id.toLowerCase());
          if (targetKey && parsed[targetKey]) {
            const savedCookies = { ...parsed[targetKey], ...currentCookies };
            if (isGeneric && resolvedName && resolvedName !== targetKey) {
              delete parsed[targetKey];
              parsed[resolvedName] = savedCookies;
            } else {
              parsed[targetKey] = savedCookies;
            }
            localStorage.setItem('unlucid_imported_cookies', JSON.stringify(parsed));
          }
        }
      } catch (e) {}

      const normalizedData: UserData = {
        id: extractedMeta.id || userObj.id || id,
        name: resolvedName,
        email: resolvedEmail,
        image: resolvedImage,
        gems: totalGems,
        totalGems: totalGems,
        matureEnabled: Boolean(userObj.matureEnabled),
        canClaimFreeGems: canClaim,
        nextFreeGemsAt: nextFreeGemsAt,
        date: userObj.date || Date.now(),
        canApplyReferral: Boolean(userObj.canApplyReferral),
        referralCode: userObj.referralCode || 'N/A',
        referralCodeUses: userObj.referralCodeUses || 0,
        referralLimit: userObj.referralLimit || 0,
        referralReward: userObj.referralReward || 0,
        isAdmin: Boolean(userObj.isAdmin),
      };

      setProfiles(prev => prev.map(p => {
          if (p.id !== id) return p;

          return { 
            ...p, 
            status: 'idle', 
            config: {
              ...p.config,
              name: finalConfigName,
              cookies: currentCookies
            },
            data: normalizedData, 
            lastUpdated: Date.now() 
          };
      }));

    } catch (err) {
      console.error(`Error fetching account ${id}:`, err);
      setProfiles(prev => prev.map(p => p.id === id ? { 
          ...p, status: 'error', message: err instanceof Error ? err.message : 'Connection Error'
      } : p));
    }
  };

  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // Audio might be blocked if page hasn't had user interaction
    }
  };

  const toggleAutoClaim = () => {
    const nextState = !autoClaimEnabled;
    setAutoClaimEnabled(nextState);
    localStorage.setItem('unlucid_auto_claim', String(nextState));

    if (nextState && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  const claimGems = async (id: string): Promise<boolean> => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'claiming', message: undefined } : p));
    
    const profile = profilesRef.current.find(p => p.id === id);
    if (!profile) return false;

    try {
      const response = await fetch(URL_CLAIM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile.config.cookies)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();
      if (result && result.claim && !result.claim.ok) {
        const errorMsg = result.claim.body?.message || `Claim failed (${result.claim.status})`;

        // If it was already claimed today (409), refresh timer and notify
        if (result.claim.status === 409 || errorMsg.includes('already claimed')) {
          await fetchAccountData(id);
          setProfiles(prev => prev.map(p => p.id === id ? { ...p, message: errorMsg } : p));
          setTimeout(() => {
            setProfiles(prev => prev.map(p => p.id === id ? { ...p, message: undefined } : p));
          }, 4000);
          return false;
        }

        throw new Error(errorMsg);
      }

      await fetchAccountData(id);
      
      setProfiles(prev => prev.map(p => {
          if (p.id !== id) return p;
          return { ...p, status: 'success', message: 'Claimed successfully' };
      }));

      setTimeout(() => {
          setProfiles(prev => prev.map(p => p.id === id ? { ...p, message: undefined } : p));
      }, 4000);

      return true;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Claim failed';
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'error', message: errorMsg } : p));
      return false;
    }
  };

  // Hands-free Auto-Claimer Interval Loop
  useEffect(() => {
    if (!autoClaimEnabled) return;

    const interval = setInterval(async () => {
      if (isAutoClaimingRef.current || globalLoading) return;

      const now = Date.now();
      const currentProfiles = profilesRef.current;
      const eligible = currentProfiles.filter(p => {
        return (
          p.data &&
          (p.data.canClaimFreeGems || (p.data.nextFreeGemsAt && p.data.nextFreeGemsAt <= now)) &&
          p.status !== 'claiming' &&
          p.status !== 'loading'
        );
      });

      if (eligible.length > 0) {
        isAutoClaimingRef.current = true;
        try {
          const results = await Promise.all(eligible.map(p => claimGems(p.id)));
          const claimedCount = results.filter(Boolean).length;
          if (claimedCount > 0) {
            if (soundEnabled) playChime();
            setAutoClaimCount(prev => prev + claimedCount);

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                const names = eligible.map(p => p.config.name).join(', ');
                new Notification('💎 Gems Auto-Claimed!', {
                  body: `Successfully claimed credits for: ${names}`,
                });
              } catch (e) {}
            }
          }
        } catch (err) {
          console.error("Auto-claim error:", err);
        } finally {
          isAutoClaimingRef.current = false;
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [autoClaimEnabled, globalLoading, soundEnabled]);

  const handleClaimAll = async () => {
    setGlobalLoading(true);
    const eligible = profiles.filter(p => {
        if (!p.data) return false;
        return p.data.canClaimFreeGems || (p.data.nextFreeGemsAt && p.data.nextFreeGemsAt <= Date.now());
    });

    await Promise.all(eligible.map(p => claimGems(p.id)));
    handleRefreshAll();
    setGlobalLoading(false);
  };

  const handleRefreshAll = () => {
    profiles.forEach(p => fetchAccountData(p.id));
  };



  const totalGems = useMemo(() => profiles.reduce((acc, curr) => acc + (curr.data?.gems || 0), 0), [profiles]);
  const readyToClaim = useMemo(
    () => profiles.filter(p => p.data && (p.data.canClaimFreeGems || (p.data.nextFreeGemsAt && p.data.nextFreeGemsAt <= Date.now()))).length,
    [profiles]
  );

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-sans pb-32 relative selection:bg-emerald-500/30 transition-colors duration-300">
      {initialLoading && <Preloader onFinish={() => setInitialLoading(false)} isLoading={initialLoading} />}
      <DrawingCursor />
      
      {/* Background Effects */}
      {/* Background Effects */}
      <div className="fixed inset-0 bg-grid-pattern z-0 opacity-40 pointer-events-none invert dark:invert-0"></div>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-emerald-500/5 dark:bg-emerald-900/10 blur-[120px] rounded-full z-0 pointer-events-none"></div>

      {/* Header */}
      <header className="sticky top-4 z-40 max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="bg-white/70 dark:bg-[#121214]/70 backdrop-blur-3xl border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-2xl flex items-center justify-between px-5 h-16 transition-colors duration-300">
            
            {/* Logo Area */}
            <div className="flex items-center gap-3">
                <div className="relative">
                    <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                        <Diamond size={16} className="text-black fill-current" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
                </div>
                <div>
                    <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white leading-none">UNLUCID<span className="text-zinc-400 dark:text-zinc-500 font-light ml-1">MANAGER</span></h1>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono tracking-wider mt-0.5">V2.0 DASHBOARD</p>
                </div>
            </div>

            {/* Stats & Controls */}
            <div className="flex items-center gap-3 sm:gap-6">
                <div className="hidden md:flex items-center gap-3 bg-zinc-100 dark:bg-black/20 px-4 py-1.5 rounded-lg border border-zinc-200 dark:border-white/5">
                    <div className="flex items-center gap-2 border-r border-zinc-200 dark:border-white/10 pr-4">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Total</span>
                        <span className="text-sm font-mono font-bold text-zinc-700 dark:text-zinc-200">{totalGems.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Ready</span>
                        <span className={`text-sm font-mono font-bold ${readyToClaim > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>{readyToClaim}</span>
                    </div>
                </div>

                <div className="h-6 w-px bg-zinc-200 dark:bg-white/10 hidden sm:block"></div>
                
                <ThemeToggle />


            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 lg:px-6 py-8 relative z-10">
        
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
             <div className="flex flex-wrap items-center gap-3">
                 <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    Accounts
                    <span className="flex items-center justify-center w-6 h-6 text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full border border-zinc-200 dark:border-zinc-700">{profiles.length}</span>
                 </h2>

                 {autoClaimEnabled && (
                     <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full animate-in fade-in duration-300">
                         <span className="relative flex h-2 w-2">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                         </span>
                         <span>Auto-Pilot: Scanning timers {autoClaimCount > 0 ? `(${autoClaimCount} claimed)` : ''}</span>
                     </div>
                 )}
             </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {/* Auto-Pilot Toggle */}
                <div className="flex items-center gap-1.5">
                    <button 
                        onClick={toggleAutoClaim}
                        className={`px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border shadow-sm ${
                            autoClaimEnabled
                                ? 'bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                        }`}
                        title={autoClaimEnabled ? "Auto-Claim is Active (Hands-Free Monitoring)" : "Turn On Hands-Free Auto-Claim"}
                    >
                        <div className="relative flex items-center justify-center">
                            <Sparkles size={14} className={autoClaimEnabled ? "text-emerald-500 animate-pulse" : "text-zinc-400"} />
                            {autoClaimEnabled && (
                                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                            )}
                        </div>
                        <span>Auto-Pilot: <strong className={autoClaimEnabled ? "text-emerald-600 dark:text-emerald-400 font-extrabold" : "text-zinc-500 dark:text-zinc-400 font-medium"}>{autoClaimEnabled ? "ON" : "OFF"}</strong></span>
                    </button>

                    {autoClaimEnabled && (
                        <button
                            onClick={() => {
                                const next = !soundEnabled;
                                setSoundEnabled(next);
                                localStorage.setItem('unlucid_sound_enabled', String(next));
                            }}
                            className={`p-2.5 rounded-lg border text-xs transition-colors ${
                                soundEnabled 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20' 
                                    : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600'
                            }`}
                            title={soundEnabled ? "Audio Chime ON (Click to Mute)" : "Audio Chime Muted (Click to Unmute)"}
                        >
                            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                        </button>
                    )}
                </div>

                <div className="h-5 w-px bg-zinc-200 dark:bg-white/10 hidden sm:block"></div>

                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 hover:shadow-emerald-500/30"
                >
                    <Plus size={15} />
                    Add Account
                </button>
                <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-4 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-sm dark:shadow-none"
                >
                    <Import size={14} />
                    Import
                </button>
                <button 
                    onClick={handleExportCookies}
                    disabled={profiles.length === 0}
                    className={`px-4 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-sm dark:shadow-none ${profiles.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Download size={14} />
                    Export
                </button>
                {profiles.length > 0 && (
                    <>
                        <button 
                            onClick={handleRefreshAll}
                            disabled={globalLoading}
                            className="px-4 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-sm dark:shadow-none"
                        >
                            <RefreshCw size={14} className={globalLoading ? "animate-spin" : ""} />
                            Sync
                        </button>
                        <button 
                            onClick={handleClaimAll}
                            disabled={readyToClaim === 0 || globalLoading}
                            className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg ${
                                readyToClaim > 0 
                                ? 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-emerald-500/20 dark:shadow-emerald-900/20 hover:shadow-emerald-500/40 dark:hover:shadow-emerald-900/40 hover:-translate-y-0.5' 
                                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border border-zinc-200 dark:border-zinc-800 cursor-not-allowed'
                            }`}
                        >
                            {globalLoading ? <Zap className="animate-spin" size={14}/> : <Layers size={14} />}
                            Claim All ({readyToClaim})
                        </button>
                    </>
                )}
            </div>
        </div>

        {/* Grid */}
        {profiles.length === 0 ? (
             <div className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-3xl p-16 text-center bg-white/50 dark:bg-black/20 backdrop-blur-sm">
                <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900/80 rounded-3xl flex items-center justify-center mx-auto mb-6 text-zinc-400 dark:text-zinc-700 shadow-inner border border-zinc-200 dark:border-white/5">
                    <LogOut size={32} />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No accounts active</h3>
                <p className="text-zinc-500 max-w-sm mx-auto mb-8 text-sm leading-relaxed">
                    Get started by importing your session cookies. <br/>
                    <span className="text-xs text-zinc-600 mt-2 block">Use the extension to export your profiles or add them manually.</span>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center gap-2"
                    >
                        <Plus size={16} />
                        Add Account
                    </button>
                    <button 
                        onClick={() => setIsImportModalOpen(true)}
                        className="px-6 py-3 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                    >
                        <Import size={16} />
                        Import Cookies
                    </button>
                </div>

             </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 items-start">
                {profiles.map(profile => (
                    <AccountCard 
                        key={profile.id} 
                        profile={profile} 
                        onClaim={claimGems}
                        onRefresh={() => fetchAccountData(profile.id)}
                        onUpdate={handleUpdateAccount}
                        onDelete={handleDeleteAccount}
                    />
                ))}
            </div>
        )}
      </main>


      
      <footer className="fixed bottom-0 left-0 right-0 p-6 text-center z-10 pointer-events-none">
        <p className="text-[10px] text-zinc-600 font-mono tracking-widest uppercase opacity-50">
          Unlucid Manager v2.0 • <span className="text-zinc-500">System Active</span>
        </p>
      </footer>

      <CookieImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSave={handleSaveImportedCookies}
        initialData={getImportedCookiesForModal()}
      />

      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddAccount}
        existingNames={existingAccountNames}
        suggestedName={suggestedAccountName}
      />
      
    </div>
    </ThemeProvider>
  );
}

export default App;