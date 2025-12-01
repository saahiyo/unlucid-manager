import React, { useState, useEffect, useMemo } from 'react';
import { ProfileState, RawCookiesJson } from './types';
import { URL_ACCOUNT, URL_CLAIM } from './config';
import { AccountCard } from './components/AccountCard';
import { ThemeProvider } from './components/ThemeProvider';
import { ThemeToggle } from './components/ThemeToggle';

import { Diamond, Layers, LogOut, RefreshCw, Zap, Import, Download } from 'lucide-react';

import { DrawingCursor } from './components/DrawingCursor';
import { Preloader } from './components/Preloader';
import { CookieImportModal } from './components/CookieImportModal';

function App() {
  const [profiles, setProfiles] = useState<ProfileState[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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
    // Convert array to RawCookiesJson format
    const newCookies: RawCookiesJson = {};
    importedAccounts.forEach(acc => {
      newCookies[acc.name] = {
        "__Secure-authjs.session-token": acc.token
      };
    });

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
    
    handleLoadCookies(combinedCookies);
  };

  const getImportedCookiesForModal = () => {
      try {
          const localCookies = localStorage.getItem('unlucid_imported_cookies');
          if (localCookies) {
              const parsed = JSON.parse(localCookies);
              return Object.entries(parsed).map(([name, cookies]: [string, any]) => ({
                  name,
                  token: cookies["__Secure-authjs.session-token"] || ""
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
    const currentCookies = cookies || profile?.config.cookies;

    if (!currentCookies) return;

    try {
      const response = await fetch(URL_ACCOUNT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentCookies)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();
      
      // Check for the nested structure based on the new type definition
      if (result && result.account && result.account.body && result.account.body.user) {
        setProfiles(prev => prev.map(p => {
            if (p.id !== id) return p;
            return { ...p, status: 'idle', data: result.account.body.user, lastUpdated: Date.now() };
        }));
      } else {
         throw new Error('Invalid response');
      }

    } catch (err) {
      console.error(`Error fetching account ${id}:`, err);
      setProfiles(prev => prev.map(p => p.id === id ? { 
          ...p, status: 'error', message: err instanceof Error ? err.message : 'Connection Error'
      } : p));
    }
  };

  const claimGems = async (id: string) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'claiming', message: undefined } : p));
    
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;

    try {
      const response = await fetch(URL_CLAIM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile.config.cookies)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await fetchAccountData(id);
      
      setProfiles(prev => prev.map(p => {
          if (p.id !== id) return p;
          return { ...p, status: 'success', message: 'Claimed successfully' };
      }));

      setTimeout(() => {
          setProfiles(prev => prev.map(p => p.id === id ? { ...p, message: undefined } : p));
      }, 4000);

    } catch (err) {
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'error', message: 'Claim failed' } : p));
    }
  };

  const handleClaimAll = async () => {
    setGlobalLoading(true);
    const eligible = profiles.filter(p => {
        if (!p.data) return false;
        return p.data.nextFreeGemsAt <= Date.now();
    });

    await Promise.all(eligible.map(p => claimGems(p.id)));
    setGlobalLoading(false);
  };

  const handleRefreshAll = () => {
    profiles.forEach(p => fetchAccountData(p.id));
  };



  const totalGems = useMemo(() => profiles.reduce((acc, curr) => acc + (curr.data?.gems || 0), 0), [profiles]);
  const readyToClaim = useMemo(() => profiles.filter(p => p.data && p.data.nextFreeGemsAt <= Date.now()).length, [profiles]);

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
             <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                Accounts
                <span className="flex items-center justify-center w-6 h-6 text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full border border-zinc-200 dark:border-zinc-700">{profiles.length}</span>
             </h2>

            <div className="flex gap-2 w-full sm:w-auto">
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
                <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center gap-2 mx-auto"
                >
                    <Import size={16} />
                    Import Cookies
                </button>

             </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 items-start">
                {profiles.map(profile => (
                    <AccountCard 
                        key={profile.id} 
                        profile={profile} 
                        onClaim={claimGems}
                        onRefresh={() => fetchAccountData(profile.id)}
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
      
    </div>
    </ThemeProvider>
  );
}

export default App;