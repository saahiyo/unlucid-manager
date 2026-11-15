import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ProfileState, RawCookiesJson, UserData } from './types';
import { ThemeProvider } from './components/ThemeProvider';
import { ThemeToggle } from './components/ThemeToggle';

import { Diamond, Layers, RefreshCw, Zap, Import, Download, Sparkles, Plus, ArrowUpDown, AlertTriangle, MoreHorizontal } from 'lucide-react';

import { Preloader } from './components/Preloader';
import { CookieImportModal } from './components/CookieImportModal';
import { AddAccountModal } from './components/AddAccountModal';
import { SortableAccountCard } from './components/SortableAccountCard';
import { parseCookiesInput, getPrimaryToken } from './cookieUtils';
import {
  apiBatchFetch,
  apiClaimGems,
  apiFetchAccount,
  apiSyncDeleteAccount,
  apiSyncReplaceAccounts,
  apiSyncUpsertAccount,
} from './lib/api';
import { SYNC_SECRET } from './config';
import {
  createLocalAccount,
  loadMergedAccounts,
  lockAccountIdentity,
  normalizeEmail,
  removeAccount,
  unmarkDeleted,
  updateAccountCookiesOnly,
  upsertAccount,
  type StoredAccount,
} from './lib/accountStore';

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

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

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

  const storedToProfile = (account: StoredAccount): ProfileState => ({
    id: account.id,
    config: {
      name: account.label,
      email: account.email,
      cookies: account.cookies,
    },
    data: null,
    status: 'loading',
  });

  const pushAccountToServer = (account: {
    id: string;
    email?: string;
    label?: string;
    cookies: Record<string, string>;
  }) => {
    void apiSyncUpsertAccount({
      id: account.id,
      email: account.email,
      label: account.label,
      cookies: account.cookies,
    });
  };

  // Initialize from stable account registry (+ env / legacy migrate)
  useEffect(() => {
    const accounts = loadMergedAccounts(import.meta.env.VITE_COOKIES as string | undefined);
    if (accounts.length > 0) {
      handleLoadAccounts(accounts);
    } else {
      setAccountsReady(true);
    }
  }, []);

  // Push local registry to server once ready (cron reads this store)
  useEffect(() => {
    if (!accountsReady || !SYNC_SECRET || profiles.length === 0) return;
    void apiSyncReplaceAccounts(
      profiles.map((p) => ({
        id: p.id,
        email: p.config.email || normalizeEmail(p.config.cookies.gmail),
        label: p.config.name,
        cookies: p.config.cookies,
      }))
    );
  }, [accountsReady]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot after initial load

  const handleSaveImportedCookies = (importedAccounts: { name: string; token: string }[]) => {
    const seenTokens = new Set<string>();

    importedAccounts.forEach((acc) => {
      const parsed = parseCookiesInput(acc.token);
      const token = getPrimaryToken(parsed) || acc.token.trim();
      if (!token || seenTokens.has(token)) return;
      seenTokens.add(token);

      const created = createLocalAccount(acc.name, parsed);
      unmarkDeleted(created.id);
      if (created.email) unmarkDeleted(created.email);
      upsertAccount(created);
      pushAccountToServer(created);
    });

    const accounts = loadMergedAccounts(import.meta.env.VITE_COOKIES as string | undefined);
    handleLoadAccounts(accounts);
  };

  /** Cookie-only refresh — identity (id / gmail) stays locked */
  const handleUpdateAccount = async (id: string, newToken: string) => {
    const trimmedToken = newToken.trim();
    if (!trimmedToken) return;

    const existingProfile = profiles.find((p) => p.id === id);
    if (!existingProfile) return;

    const parsedCookies = parseCookiesInput(trimmedToken);
    const base: StoredAccount = {
      id: existingProfile.id,
      label: existingProfile.config.name,
      email: existingProfile.config.email || normalizeEmail(existingProfile.config.cookies.gmail),
      cookies: existingProfile.config.cookies,
      source: 'local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = updateAccountCookiesOnly(base, parsedCookies);
    unmarkDeleted(updated.id);
    if (updated.email) unmarkDeleted(updated.email);
    upsertAccount(updated);
    pushAccountToServer(updated);

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              config: {
                ...p.config,
                email: updated.email,
                cookies: updated.cookies,
              },
              status: 'loading',
              message: undefined,
            }
          : p
      )
    );

    await fetchAccountData(id, updated.cookies);
  };

  const handleDeleteAccount = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    removeAccount(id);
    const email = normalizeEmail(profile?.config.email || profile?.config.cookies.gmail);
    if (email && email !== id) {
      removeAccount(email);
    }
    void apiSyncDeleteAccount(id);
    if (email && email !== id) void apiSyncDeleteAccount(email);
    setProfiles((prev) => prev.filter((p) => p.id !== id && p.id !== email));
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
      const duplicate = profiles.find((p) => {
        const pt = getPrimaryToken(p.config.cookies);
        return pt && (pt === newPrimaryToken || pt.includes(newPrimaryToken) || newPrimaryToken.includes(pt));
      });
      if (duplicate) {
        throw new Error(
          `This session token is already in use by "${duplicate.config.email || duplicate.config.name}". Update cookies on that card instead.`
        );
      }
    }

    const cookieEmail = normalizeEmail(newCookiesRecord.gmail || newCookiesRecord.email);
    if (cookieEmail) {
      const existing = profiles.find(
        (p) =>
          normalizeEmail(p.config.email) === cookieEmail ||
          normalizeEmail(p.config.cookies.gmail) === cookieEmail ||
          normalizeEmail(p.data?.email) === cookieEmail
      );
      if (existing) {
        throw new Error(
          `Gmail ${cookieEmail} is already on the dashboard. Open that card and update cookies only.`
        );
      }
    }

    const created = createLocalAccount(trimmedName, newCookiesRecord);
    unmarkDeleted(created.id);
    if (created.email) unmarkDeleted(created.email);
    upsertAccount(created);
    pushAccountToServer(created);

    const newProfile = storedToProfile(created);
    setProfiles((prev) => [newProfile, ...prev]);

    await fetchAccountData(created.id, created.cookies);
  };

  const getImportedCookiesForModal = () => {
    return profiles.map((p) => ({
      name: p.config.email || p.config.name,
      token: getPrimaryToken(p.config.cookies),
    }));
  };

  const handleExportCookies = () => {
    const exportData: RawCookiesJson = {};
    profiles.forEach((p) => {
      const key = p.config.email || p.id || p.config.name;
      exportData[key] = p.config.cookies;
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "unlucid_cookies_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleLoadAccounts = async (accounts: StoredAccount[]) => {
    const newProfiles = accounts.map(storedToProfile);
    setProfiles(newProfiles);

    try {
      const results = await apiBatchFetch(
        newProfiles.map((p) => ({ id: p.id, cookies: p.config.cookies }))
      );
      results.forEach((r) => {
        if (r.ok && r.data) {
          const profile = newProfiles.find((p) => p.id === r.id);
          applyNormalizedAccount(r.id, { ...(profile?.config.cookies || {}) }, r.data);
        } else {
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === r.id
                ? { ...p, status: 'error', message: r.message || 'Failed to load' }
                : p
            )
          );
        }
      });
    } catch {
      await Promise.all(newProfiles.map((p) => fetchAccountData(p.id, p.config.cookies)));
    }

    setAccountsReady(true);
  };

  const applyNormalizedAccount = (
    id: string,
    currentCookies: Record<string, string>,
    normalizedData: UserData
  ) => {
    const profile = profilesRef.current.find((p) => p.id === id);
    if (!profile) return;

    const resolvedName = normalizedData.name || profile.config.name || id;
    const resolvedEmail =
      normalizeEmail(normalizedData.email) ||
      normalizeEmail(profile.config.email) ||
      normalizeEmail(currentCookies.gmail);

    // Prefer persisted manual timer override when still in the future
    try {
      const timersStr = localStorage.getItem('unlucid_account_timers');
      if (timersStr) {
        const timersMap = JSON.parse(timersStr);
        const timerKey = resolvedEmail || id;
        const override = timersMap[id] || timersMap[timerKey];
        if (override && override > Date.now() && !normalizedData.canClaimFreeGems) {
          normalizedData = {
            ...normalizedData,
            nextFreeGemsAt: override,
            canClaimFreeGems: false,
          };
        }
      }
    } catch (e) {}

    // Same Gmail already on another card → merge cookies into that card, drop the temp one
    if (resolvedEmail) {
      const existingDuplicate = profilesRef.current.find((p) => {
        if (p.id === id) return false;
        return (
          normalizeEmail(p.config.email) === resolvedEmail ||
          normalizeEmail(p.config.cookies.gmail) === resolvedEmail ||
          normalizeEmail(p.data?.email) === resolvedEmail
        );
      });

      if (existingDuplicate) {
        const mergedCookies = updateAccountCookiesOnly(
          {
            id: existingDuplicate.id,
            label: existingDuplicate.config.name,
            email: resolvedEmail,
            cookies: existingDuplicate.config.cookies,
            source: 'local',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          currentCookies
        );
        const locked = lockAccountIdentity(mergedCookies, resolvedEmail, resolvedName);
        upsertAccount(locked);
        removeAccount(id);
        pushAccountToServer(locked);
        if (id !== locked.id) void apiSyncDeleteAccount(id);

        setCustomOrder((prev) => {
          const next = prev.filter((oid) => oid !== id);
          localStorage.setItem('unlucid_custom_order', JSON.stringify(next));
          return next;
        });

        setProfiles((prev) =>
          prev
            .filter((p) => p.id !== id)
            .map((p) =>
              p.id === existingDuplicate.id
                ? {
                    ...p,
                    status: 'idle',
                    message: undefined,
                    config: {
                      name: locked.label,
                      email: locked.email,
                      cookies: locked.cookies,
                    },
                    data: normalizedData,
                    lastUpdated: Date.now(),
                  }
                : p
            )
        );
        return;
      }
    }

    const base: StoredAccount = {
      id: profile.id,
      label: profile.config.name,
      email: profile.config.email || normalizeEmail(profile.config.cookies.gmail),
      cookies: currentCookies,
      source: 'local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const locked = lockAccountIdentity(base, resolvedEmail, resolvedName);
    const previousId = id;

    // Persist under stable id (may promote acc_* → email once)
    if (locked.id !== previousId) {
      removeAccount(previousId);
      unmarkDeleted(locked.id);
      void apiSyncDeleteAccount(previousId);
    }
    upsertAccount(locked);
    pushAccountToServer(locked);

    // Migrate timer + custom order keys if id promoted to gmail
    if (locked.id !== previousId) {
      try {
        const timersStr = localStorage.getItem('unlucid_account_timers');
        if (timersStr) {
          const timersMap = JSON.parse(timersStr);
          if (timersMap[previousId] && !timersMap[locked.id]) {
            timersMap[locked.id] = timersMap[previousId];
            delete timersMap[previousId];
            localStorage.setItem('unlucid_account_timers', JSON.stringify(timersMap));
          }
        }
      } catch (e) {}

      setCustomOrder((prev) => {
        const next = prev.map((oid) => (oid === previousId ? locked.id : oid));
        localStorage.setItem('unlucid_custom_order', JSON.stringify(next));
        return next;
      });
    }

    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== previousId) return p;
        return {
          ...p,
          id: locked.id,
          status: 'idle',
          message: undefined,
          config: {
            name: locked.label,
            email: locked.email,
            cookies: locked.cookies,
          },
          data: normalizedData,
          lastUpdated: Date.now(),
        };
      })
    );
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
      <main className="py-3 sm:py-8">
        
        {/* Toolbar — compact on mobile, one row on desktop */}
        <div className="flex flex-col gap-2 mb-3 sm:mb-6 md:flex-row md:items-center md:justify-between md:gap-4">
          {/* Title + filters */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <h2 className="text-sm sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 sm:gap-2 shrink-0">
              Accounts
              <span className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full border border-zinc-200 dark:border-zinc-700">
                {profiles.length}
              </span>
            </h2>

            <div className="flex items-center overflow-x-auto no-scrollbar max-w-full">
              <div className="flex items-center bg-zinc-200/60 dark:bg-black/30 p-0.5 sm:p-1 rounded-lg sm:rounded-xl border border-zinc-300/70 dark:border-white/5 text-[11px] sm:text-xs shrink-0">
                <button
                  onClick={() => {
                    setFilterBy('all');
                    localStorage.setItem('unlucid_filter_by', 'all');
                  }}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg font-semibold transition-all ${
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
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg font-semibold transition-all flex items-center gap-1 sm:gap-1.5 ${
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
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg font-semibold transition-all flex items-center gap-1 sm:gap-1.5 ${
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
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg font-semibold transition-all flex items-center gap-1 sm:gap-1.5 ${
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

          {/* Controls — one compact row on mobile */}
          <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto shrink-0">
            <div className="flex items-center gap-1 min-h-8 sm:min-h-10 flex-1 md:flex-none md:w-auto bg-white/70 dark:bg-zinc-900 border border-zinc-300/80 dark:border-zinc-800 rounded-lg px-2 sm:px-2.5 text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-300 shadow-sm dark:shadow-none">
              <ArrowUpDown size={12} className="text-zinc-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => {
                  const val = e.target.value as SortOption;
                  setSortBy(val);
                  localStorage.setItem('unlucid_sort_by', val);
                }}
                className="w-full md:w-auto bg-transparent border-none text-[11px] sm:text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
                aria-label="Sort accounts"
              >
                <option value="valid_first" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Valid first</option>
                <option value="gems" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Highest gems</option>
                <option value="name" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Name A–Z</option>
                <option value="custom" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Custom</option>
              </select>
            </div>

            <button 
              onClick={handleClaimAll}
              disabled={profiles.length === 0 || readyToClaim === 0 || globalLoading}
              className={`min-h-8 sm:min-h-10 px-2.5 sm:px-3.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 shadow-sm shrink-0 ${
                profiles.length > 0 && readyToClaim > 0 
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20' 
                  : 'bg-zinc-200/80 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-600 border border-zinc-300/80 dark:border-zinc-800 cursor-not-allowed'
              }`}
            >
              {globalLoading ? <Zap className="animate-spin" size={12}/> : <Layers size={12} />}
              <span className="hidden min-[380px]:inline">Claim All</span>
              <span className="min-[380px]:hidden">Claim</span>
              {readyToClaim > 0 ? ` (${readyToClaim})` : ''}
            </button>

            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="min-h-8 sm:min-h-10 px-2.5 sm:px-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 shadow-sm shadow-emerald-500/20 shrink-0"
            >
              <Plus size={13} />
              Add
            </button>

            <div className="relative shrink-0" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(prev => !prev)}
                className={`min-h-8 min-w-8 sm:min-h-10 sm:min-w-10 flex items-center justify-center rounded-lg border text-xs font-bold transition-all shadow-sm ${
                  isMoreMenuOpen
                    ? 'bg-zinc-200 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 text-zinc-900 dark:text-white'
                    : 'bg-white/70 dark:bg-zinc-900 border-zinc-300/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                }`}
                aria-label="More actions"
                aria-expanded={isMoreMenuOpen}
              >
                <MoreHorizontal size={15} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 items-start">
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