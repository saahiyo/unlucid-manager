import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ProfileState, RawCookiesJson, UserData } from './types';
import { ThemeProvider } from './components/ThemeProvider';
import { ThemeToggle } from './components/ThemeToggle';

import { Diamond, Layers, RefreshCw, Zap, Import, Download, Sparkles, Volume2, VolumeX, Plus, ArrowUpDown, AlertTriangle, MoreHorizontal } from 'lucide-react';

import { Preloader } from './components/Preloader';
import { CookieImportModal } from './components/CookieImportModal';
import { AddAccountModal } from './components/AddAccountModal';
import { SortableAccountCard } from './components/SortableAccountCard';
import { parseCookiesInput, getPrimaryToken } from './cookieUtils';
import { apiBatchFetch, apiClaimGems, apiFetchAccount } from './lib/api';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';

type SortOption = 'valid_first' | 'gems' | 'name' | 'custom';
type FilterOption = 'all' | 'valid' | 'ready' | 'offline';

function App() {
  const [profiles, setProfiles] = useState<ProfileState[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [showPreloader, setShowPreloader] = useState(true);
  const [accountsReady, setAccountsReady] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Sorting & Filtering State (default: keep valid at start/top with shortest timer)
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    return (localStorage.getItem('unlucid_sort_by') as SortOption) || 'valid_first';
  });
  const [filterBy, setFilterBy] = useState<FilterOption>(() => {
    return (localStorage.getItem('unlucid_filter_by') as FilterOption) || 'all';
  });

  // Custom drag order (array of profile IDs in user-defined order)
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('unlucid_custom_order');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // DnD sensors with activation distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

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

  // Close More menu on outside click / Escape
  useEffect(() => {
    if (!isMoreMenuOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreMenuOpen]);

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

      // 4. Deduplicate entries sharing the exact same primary session token
      const deduplicatedCookies: RawCookiesJson = {};
      const seenTokens = new Map<string, string>(); // token -> existingKey

      Object.entries(combinedCookies).forEach(([key, cookies]) => {
        const token = getPrimaryToken(cookies);
        if (!token) {
          deduplicatedCookies[key] = cookies;
          return;
        }

        const existingKey = seenTokens.get(token);
        if (!existingKey) {
          seenTokens.set(token, key);
          deduplicatedCookies[key] = cookies;
        } else {
          // If collision occurs and this key has a custom/human name while the existing one is generic, prefer custom name
          const existingIsGeneric = /^account \d+$/i.test(existingKey);
          const currentIsGeneric = /^account \d+$/i.test(key);

          if (existingIsGeneric && !currentIsGeneric) {
            delete deduplicatedCookies[existingKey];
            seenTokens.set(token, key);
            deduplicatedCookies[key] = cookies;
          }
        }
      });

      if (Object.keys(deduplicatedCookies).length > 0) {
        handleLoadCookies(deduplicatedCookies);
      } else {
        setAccountsReady(true);
      }
    };

    loadAllCookies();
  }, []);

  const handleSaveImportedCookies = (importedAccounts: { name: string; token: string }[]) => {
    // Deduplicate imported accounts by primary token
    const seenTokens = new Set<string>();
    const deduplicatedAccounts: { name: string; token: string }[] = [];

    importedAccounts.forEach(acc => {
      const parsed = parseCookiesInput(acc.token);
      const token = getPrimaryToken(parsed) || acc.token.trim();
      if (!seenTokens.has(token)) {
        seenTokens.add(token);
        deduplicatedAccounts.push(acc);
      }
    });

    // Convert array to RawCookiesJson format using universal parser
    const newCookies: RawCookiesJson = {};
    const importedNames: string[] = [];
    deduplicatedAccounts.forEach(acc => {
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

  const existingAccountTokens = useMemo(() => {
    return profiles
      .map(p => ({
        name: p.config.name,
        token: getPrimaryToken(p.config.cookies)
      }))
      .filter((t): t is { name: string; token: string } => Boolean(t.token));
  }, [profiles]);

  const handleAddAccount = async (name: string, token: string) => {
    const trimmedName = name.trim();
    const trimmedToken = token.trim();
    if (!trimmedName || !trimmedToken) return;

    const newCookiesRecord = parseCookiesInput(trimmedToken);
    const newPrimaryToken = getPrimaryToken(newCookiesRecord);

    if (newPrimaryToken) {
      const duplicate = profiles.find(p => {
        const pt = getPrimaryToken(p.config.cookies);
        return pt && (pt === newPrimaryToken || pt.includes(newPrimaryToken) || newPrimaryToken.includes(pt));
      });
      if (duplicate) {
        throw new Error(`This session token is already in use by account "${duplicate.config.name}".`);
      }
    }

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
      status: 'loading'
    }));
    setProfiles(newProfiles);

    try {
      const results = await apiBatchFetch(
        newProfiles.map(p => ({ id: p.id, cookies: p.config.cookies }))
      );
      results.forEach((r) => {
        if (r.ok && r.data) {
          const profile = newProfiles.find(p => p.id === r.id);
          applyNormalizedAccount(r.id, { ...(profile?.config.cookies || {}) }, r.data);
        } else {
          setProfiles(prev => prev.map(p => p.id === r.id ? {
            ...p,
            status: 'error',
            message: r.message || 'Failed to load',
          } : p));
        }
      });
    } catch {
      await Promise.all(newProfiles.map(p => fetchAccountData(p.id, p.config.cookies)));
    }

    setAccountsReady(true);
  };

  const applyNormalizedAccount = (
    id: string,
    currentCookies: Record<string, string>,
    normalizedData: UserData
  ) => {
    const profile = profilesRef.current.find(p => p.id === id);
    const resolvedName = normalizedData.name || profile?.config.name || id;
    const resolvedEmail = normalizedData.email || currentCookies['gmail'] || '';

    if (resolvedEmail && currentCookies['gmail'] !== resolvedEmail) {
      currentCookies['gmail'] = resolvedEmail;
    }
    if (resolvedName && currentCookies['name'] !== resolvedName) {
      currentCookies['name'] = resolvedName;
    }

    // Prefer persisted manual timer override when still in the future
    try {
      const timersStr = localStorage.getItem('unlucid_account_timers');
      if (timersStr) {
        const timersMap = JSON.parse(timersStr);
        if (timersMap[id] && timersMap[id] > Date.now() && !normalizedData.canClaimFreeGems) {
          normalizedData = {
            ...normalizedData,
            nextFreeGemsAt: timersMap[id],
            canClaimFreeGems: false,
          };
        }
      }
    } catch (e) {}

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

    const currentToken = getPrimaryToken(currentCookies);
    const existingDuplicate = profilesRef.current.find(p => {
      if (p.id === id) return false;
      if (currentToken && getPrimaryToken(p.config.cookies) === currentToken) return true;
      if (normalizedData.id && p.data?.id && p.data.id === normalizedData.id) return true;
      if (normalizedData.email && p.data?.email && p.data.email.toLowerCase() === normalizedData.email.toLowerCase()) return true;
      return false;
    });

    if (existingDuplicate) {
      console.warn(`Duplicate account detected for "${id}" matching existing "${existingDuplicate.id}". Pruning duplicate card.`);
      setProfiles(prev => prev.filter(p => p.id !== id));
      try {
        const stored = localStorage.getItem('unlucid_imported_cookies');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed[id]) {
            delete parsed[id];
            localStorage.setItem('unlucid_imported_cookies', JSON.stringify(parsed));
          }
        }
      } catch (e) {}
      return;
    }

    setProfiles(prev => prev.map(p => {
      if (p.id !== id) return p;
      return {
        ...p,
        status: 'idle',
        message: undefined,
        config: {
          ...p.config,
          name: finalConfigName,
          cookies: currentCookies,
        },
        data: normalizedData,
        lastUpdated: Date.now(),
      };
    }));
  };

  const fetchAccountData = async (id: string, cookies?: Record<string, string>) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'loading', message: undefined } : p));

    const profile = profilesRef.current.find(p => p.id === id);
    const currentCookies = { ...(cookies || profile?.config.cookies) };

    if (!currentCookies || Object.keys(currentCookies).length === 0) return;

    try {
      const result = await apiFetchAccount(currentCookies);
      if (!result.ok) {
        throw new Error(result.message || result.code);
      }
      applyNormalizedAccount(id, currentCookies, result.data);
    } catch (err) {
      console.error(`Error fetching account ${id}:`, err);
      setProfiles(prev => prev.map(p => p.id === id ? {
        ...p,
        status: 'error',
        message: err instanceof Error ? err.message : 'Connection Error',
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
      const result = await apiClaimGems(profile.config.cookies);

      if (!result.ok) {
        if (result.code === 'ALREADY_CLAIMED') {
          await fetchAccountData(id);
          setProfiles(prev => prev.map(p => p.id === id ? { ...p, message: result.message } : p));
          setTimeout(() => {
            setProfiles(prev => prev.map(p => p.id === id ? { ...p, message: undefined } : p));
          }, 4000);
          return false;
        }

        if (result.code === 'SESSION_EXPIRED') {
          setProfiles(prev => prev.map(p => p.id === id ? {
            ...p,
            status: 'error',
            message: result.message || 'Session expired',
          } : p));
          return false;
        }

        throw new Error(result.message || 'Claim failed');
      }

      if (result.data) {
        applyNormalizedAccount(id, { ...profile.config.cookies }, result.data);
      } else {
        await fetchAccountData(id);
      }

      setProfiles(prev => prev.map(p => {
        if (p.id !== id) return p;
        return { ...p, status: 'success', message: result.message || 'Claimed successfully' };
      }));

      setTimeout(() => {
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, message: undefined } : p));
      }, 4000);

      try {
        const timersStr = localStorage.getItem('unlucid_account_timers');
        const timersMap = timersStr ? JSON.parse(timersStr) : {};
        timersMap[id] = Date.now() + 24 * 3600000;
        localStorage.setItem('unlucid_account_timers', JSON.stringify(timersMap));
      } catch (e) {}

      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Claim failed';
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'error', message: errorMsg } : p));
      return false;
    }
  };

  const handleSetTimer = (id: string, nextFreeGemsAt: number) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== id || !p.data) return p;
      return {
        ...p,
        data: {
          ...p.data,
          nextFreeGemsAt,
          canClaimFreeGems: nextFreeGemsAt <= Date.now()
        }
      };
    }));

    try {
      const timersStr = localStorage.getItem('unlucid_account_timers');
      const timersMap = timersStr ? JSON.parse(timersStr) : {};
      timersMap[id] = nextFreeGemsAt;
      localStorage.setItem('unlucid_account_timers', JSON.stringify(timersMap));
    } catch (e) {}
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

  const handleRefreshAll = async () => {
    if (profiles.length === 0) return;
    setGlobalLoading(true);
    setProfiles(prev => prev.map(p => ({ ...p, status: 'loading', message: undefined })));

    try {
      const results = await apiBatchFetch(
        profiles.map(p => ({ id: p.id, cookies: p.config.cookies }))
      );

      results.forEach((r) => {
        if (r.ok && r.data) {
          const profile = profilesRef.current.find(p => p.id === r.id);
          applyNormalizedAccount(r.id, { ...(profile?.config.cookies || {}) }, r.data);
        } else {
          setProfiles(prev => prev.map(p => p.id === r.id ? {
            ...p,
            status: 'error',
            message: r.message || 'Sync failed',
          } : p));
        }
      });
    } catch (err) {
      profiles.forEach(p => fetchAccountData(p.id));
    } finally {
      setGlobalLoading(false);
    }
  };



  const totalGems = useMemo(() => profiles.reduce((acc, curr) => acc + (curr.data?.gems || 0), 0), [profiles]);
  const readyToClaim = useMemo(
    () => profiles.filter(p => p.data && (p.data.canClaimFreeGems || (p.data.nextFreeGemsAt && p.data.nextFreeGemsAt <= Date.now()))).length,
    [profiles]
  );
  const validCount = useMemo(
    () => profiles.filter(p => p.status !== 'error' && p.data !== null).length,
    [profiles]
  );
  const errorCount = useMemo(
    () => profiles.filter(p => p.status === 'error' || (!p.data && p.status !== 'loading')).length,
    [profiles]
  );

  const sortedProfiles = useMemo(() => {
    let list = [...profiles];

    // 1. Filter
    if (filterBy === 'valid') {
      list = list.filter(p => p.status !== 'error' && p.data !== null);
    } else if (filterBy === 'ready') {
      list = list.filter(p => p.data && (p.data.canClaimFreeGems || (p.data.nextFreeGemsAt && p.data.nextFreeGemsAt <= Date.now())));
    } else if (filterBy === 'offline') {
      list = list.filter(p => p.status === 'error' || (!p.data && p.status !== 'loading'));
    }

    // 2. Sort
    if (sortBy === 'custom' && customOrder.length > 0) {
      // Use saved custom order — items not in order go to end
      const orderMap = new Map<string, number>(customOrder.map((id, idx) => [id, idx]));
      return list.sort((a, b) => {
        const aIdx = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : 999999;
        const bIdx = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : 999999;
        return aIdx - bIdx;
      });
    }

    return list.sort((a, b) => {
      const aIsError = a.status === 'error';
      const bIsError = b.status === 'error';
      const aHasData = a.data !== null;
      const bHasData = b.data !== null;

      const aIsValid = aHasData && !aIsError;
      const bIsValid = bHasData && !bIsError;

      // Primary rule: KEEP VALID AT START / TOP (unless user explicitly selected Name A-Z)
      if (sortBy !== 'name') {
        if (aIsValid && !bIsValid) return -1;
        if (!aIsValid && bIsValid) return 1;
      }

      // If both are valid:
      if (aIsValid && bIsValid && a.data && b.data) {
        if (sortBy === 'gems') {
          return (b.data.gems ?? 0) - (a.data.gems ?? 0);
        }
        if (sortBy === 'name') {
          return a.config.name.localeCompare(b.config.name);
        }

        // Default 'valid_first' (Shortest wait timer first):
        // 1. Ready to claim at top
        const aReady = Boolean(a.data.canClaimFreeGems || (a.data.nextFreeGemsAt && a.data.nextFreeGemsAt <= Date.now()));
        const bReady = Boolean(b.data.canClaimFreeGems || (b.data.nextFreeGemsAt && b.data.nextFreeGemsAt <= Date.now()));
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;

        // 2. Shortest remaining timer next (soonest to be ready)
        const aTimer = a.data.nextFreeGemsAt || Infinity;
        const bTimer = b.data.nextFreeGemsAt || Infinity;
        if (aTimer !== bTimer) {
          return aTimer - bTimer; // Shortest wait time first
        }

        // 3. Highest gems next
        return (b.data.gems ?? 0) - (a.data.gems ?? 0);
      }

      // If both are errors/offline:
      if (sortBy === 'name') {
        return a.config.name.localeCompare(b.config.name);
      }
      return a.config.name.localeCompare(b.config.name, undefined, { numeric: true });
    });
  }, [profiles, sortBy, filterBy, customOrder]);

  // Handle drag end — reorder and auto-switch to Custom sort
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = sortedProfiles.map(p => p.id);
    const oldIndex = currentIds.indexOf(active.id as string);
    const newIndex = currentIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentIds, oldIndex, newIndex);
    setCustomOrder(newOrder);
    localStorage.setItem('unlucid_custom_order', JSON.stringify(newOrder));

    // Auto-switch to custom sort
    if (sortBy !== 'custom') {
      setSortBy('custom');
      localStorage.setItem('unlucid_sort_by', 'custom');
    }
  }, [sortedProfiles, sortBy]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <div className="min-h-screen bg-[#e8eaee] dark:bg-[#09090b] text-zinc-900 dark:text-white font-sans pb-28 relative selection:bg-emerald-500/30 transition-colors duration-300">
      {showPreloader && (
        <Preloader
          isLoading={!accountsReady}
          onFinish={() => setShowPreloader(false)}
        />
      )}
      
      {/* Background */}
      <div className="fixed inset-0 bg-grid-pattern z-0 opacity-40 dark:opacity-30 pointer-events-none invert dark:invert-0"></div>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[720px] h-[360px] bg-emerald-500/10 dark:bg-emerald-900/10 blur-[110px] rounded-full z-0 pointer-events-none"></div>

      {/* Max-width shell */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-3 sm:px-6">

      {/* Header */}
      <header className="sticky top-3 sm:top-4 z-40 pt-1">
        <div className="bg-white/60 dark:bg-[#121214]/75 backdrop-blur-2xl border border-zinc-300/60 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 px-3.5 sm:px-5 h-14 sm:h-16 transition-colors duration-300">
            
            {/* Logo Area */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0">
                    <Diamond size={15} className="text-black fill-current" />
                </div>
                <div className="min-w-0">
                    <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white leading-none truncate">Unlucid<span className="text-zinc-400 dark:text-zinc-500 font-medium ml-1">Manager</span></h1>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono tracking-wide mt-0.5 hidden min-[380px]:block">v2.0</p>
                </div>
            </div>

            {/* Stats & Controls */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <div className="flex items-center gap-2.5 sm:gap-3 bg-zinc-200/70 dark:bg-black/20 px-2.5 sm:px-4 py-1.5 rounded-lg border border-zinc-300/80 dark:border-white/5">
                    <div className="flex items-center gap-1.5 sm:gap-2 border-r border-zinc-200 dark:border-white/10 pr-2.5 sm:pr-3">
                        <span className="text-[9px] sm:text-[10px] text-zinc-500 uppercase font-bold">Total</span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-zinc-700 dark:text-zinc-200">{totalGems.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="text-[9px] sm:text-[10px] text-zinc-500 uppercase font-bold">Ready</span>
                        <span className={`text-xs sm:text-sm font-mono font-bold ${readyToClaim > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>{readyToClaim}</span>
                    </div>
                </div>
                
                <ThemeToggle />
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-6 sm:py-8">
        
        {/* Toolbar — stacked on mobile, one row on desktop */}
        <div className="flex flex-col gap-3 mb-5 sm:mb-6 md:flex-row md:items-center md:justify-between md:gap-4">
          {/* Title + filters */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2 shrink-0">
              Accounts
              <span className="flex items-center justify-center w-6 h-6 text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full border border-zinc-200 dark:border-zinc-700">
                {profiles.length}
              </span>
              {autoClaimEnabled && (
                <span className="ml-1 inline-flex items-center gap-1.5 text-[10px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Auto{autoClaimCount > 0 ? ` · ${autoClaimCount}` : ''}
                </span>
              )}
            </h2>

            <div className="flex items-center overflow-x-auto no-scrollbar max-w-full">
              <div className="flex items-center bg-zinc-200/60 dark:bg-black/30 p-1 rounded-xl border border-zinc-300/70 dark:border-white/5 text-xs shrink-0">
                <button
                  onClick={() => {
                    setFilterBy('all');
                    localStorage.setItem('unlucid_filter_by', 'all');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    filterBy === 'all'
                      ? 'bg-white/90 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  All ({profiles.length})
                </button>
                <button
                  onClick={() => {
                    setFilterBy('valid');
                    localStorage.setItem('unlucid_filter_by', 'valid');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    filterBy === 'valid'
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                  title="Show only valid & active accounts"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Active ({validCount})
                </button>
                {readyToClaim > 0 && (
                  <button
                    onClick={() => {
                      setFilterBy('ready');
                      localStorage.setItem('unlucid_filter_by', 'ready');
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                      filterBy === 'ready'
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Sparkles size={11} />
                    Ready ({readyToClaim})
                  </button>
                )}
                {errorCount > 0 && (
                  <button
                    onClick={() => {
                      setFilterBy('offline');
                      localStorage.setItem('unlucid_filter_by', 'offline');
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                      filterBy === 'offline'
                        ? 'bg-red-500/90 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-red-500'
                    }`}
                    title="Show accounts with expired tokens or connection errors"
                  >
                    <AlertTriangle size={11} />
                    Offline ({errorCount})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Controls — 2 rows on mobile, one compact row on desktop */}
          <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row md:items-center md:gap-2 shrink-0">
            <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2">
              <div className="flex items-center gap-1.5 min-h-10 bg-white/70 dark:bg-zinc-900 border border-zinc-300/80 dark:border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-600 dark:text-zinc-300 shadow-sm dark:shadow-none">
                <ArrowUpDown size={13} className="text-zinc-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const val = e.target.value as SortOption;
                    setSortBy(val);
                    localStorage.setItem('unlucid_sort_by', val);
                  }}
                  className="w-full md:w-auto bg-transparent border-none text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
                  aria-label="Sort accounts"
                >
                  <option value="valid_first" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Valid first</option>
                  <option value="gems" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Highest gems</option>
                  <option value="name" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Name A–Z</option>
                  <option value="custom" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Custom</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <button 
                  onClick={toggleAutoClaim}
                  className={`flex-1 md:flex-none min-h-10 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm ${
                    autoClaimEnabled
                      ? 'bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30'
                      : 'bg-white/70 dark:bg-zinc-900 border-zinc-300/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                  title={autoClaimEnabled ? "Auto-Claim is Active" : "Turn On Auto-Claim"}
                >
                  <Sparkles size={13} className={autoClaimEnabled ? "text-emerald-500" : "text-zinc-400"} />
                  <span>Auto <strong className={autoClaimEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}>{autoClaimEnabled ? "ON" : "OFF"}</strong></span>
                </button>

                {autoClaimEnabled && (
                  <button
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      localStorage.setItem('unlucid_sound_enabled', String(next));
                    }}
                    className={`min-h-10 min-w-10 flex items-center justify-center rounded-lg border text-xs transition-colors shrink-0 ${
                      soundEnabled 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                        : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                    }`}
                    title={soundEnabled ? "Mute chime" : "Unmute chime"}
                  >
                    {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={handleClaimAll}
                disabled={profiles.length === 0 || readyToClaim === 0 || globalLoading}
                className={`flex-1 md:flex-none min-h-10 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                  profiles.length > 0 && readyToClaim > 0 
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20' 
                    : 'bg-zinc-200/80 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-600 border border-zinc-300/80 dark:border-zinc-800 cursor-not-allowed'
                }`}
              >
                {globalLoading ? <Zap className="animate-spin" size={13}/> : <Layers size={13} />}
                Claim All{readyToClaim > 0 ? ` (${readyToClaim})` : ''}
              </button>

              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="min-h-10 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-500/20 shrink-0"
              >
                <Plus size={14} />
                Add
              </button>

              <div className="relative shrink-0" ref={moreMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsMoreMenuOpen(prev => !prev)}
                  className={`min-h-10 min-w-10 flex items-center justify-center rounded-lg border text-xs font-bold transition-all shadow-sm ${
                    isMoreMenuOpen
                      ? 'bg-zinc-200 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 text-zinc-900 dark:text-white'
                      : 'bg-white/70 dark:bg-zinc-900 border-zinc-300/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                  aria-label="More actions"
                  aria-expanded={isMoreMenuOpen}
                >
                  <MoreHorizontal size={16} />
                </button>

                {isMoreMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 z-50 rounded-xl border border-zinc-300/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900 shadow-xl dark:shadow-2xl backdrop-blur-xl py-1.5 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        setIsImportModalOpen(true);
                      }}
                      className="w-full min-h-10 px-3 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2.5"
                    >
                      <Import size={14} className="text-zinc-400" />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (profiles.length === 0) return;
                        setIsMoreMenuOpen(false);
                        handleExportCookies();
                      }}
                      disabled={profiles.length === 0}
                      className={`w-full min-h-10 px-3 text-left text-xs font-semibold flex items-center gap-2.5 ${
                        profiles.length === 0
                          ? 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                          : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Download size={14} className="text-zinc-400" />
                      Export
                    </button>
                    <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                    <button
                      type="button"
                      onClick={() => {
                        if (profiles.length === 0 || globalLoading) return;
                        setIsMoreMenuOpen(false);
                        handleRefreshAll();
                      }}
                      disabled={profiles.length === 0 || globalLoading}
                      className={`w-full min-h-10 px-3 text-left text-xs font-semibold flex items-center gap-2.5 ${
                        profiles.length === 0 || globalLoading
                          ? 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                          : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <RefreshCw size={14} className={`text-zinc-400 ${globalLoading ? 'animate-spin' : ''}`} />
                      Sync all
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        {profiles.length === 0 ? (
          <div className="rounded-2xl border border-zinc-300/50 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] px-6 py-16 text-center">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">No accounts yet</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xs mx-auto">
              Add a session token to start tracking gems.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <Plus size={15} />
                Add account
              </button>
              <button 
                onClick={() => setIsImportModalOpen(true)}
                className="px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-lg border border-zinc-300/70 dark:border-white/10 hover:bg-zinc-100/80 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <Import size={15} />
                Import
              </button>
            </div>
          </div>
        ) : sortedProfiles.length === 0 ? (
          <div className="rounded-2xl border border-zinc-300/50 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] px-6 py-12 text-center">
            <p className="text-sm text-zinc-500 mb-4">No {filterBy} accounts found.</p>
            <button
              onClick={() => {
                setFilterBy('all');
                localStorage.setItem('unlucid_filter_by', 'all');
              }}
              className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Show all
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedProfiles.map(p => p.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
                {sortedProfiles.map(profile => (
                  <SortableAccountCard
                    key={profile.id} 
                    profile={profile} 
                    onClaim={claimGems}
                    onRefresh={() => fetchAccountData(profile.id)}
                    onUpdate={handleUpdateAccount}
                    onDelete={handleDeleteAccount}
                    onSetTimer={handleSetTimer}
                    isDragEnabled={sortBy === 'custom'}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>

      <footer className="pb-8 pt-2 text-center">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono tracking-wide">
          Unlucid Manager v2.0
        </p>
      </footer>

      </div>

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
        existingTokens={existingAccountTokens}
        suggestedName={suggestedAccountName}
      />
      
    </div>
    </ThemeProvider>
  );
}

export default App;