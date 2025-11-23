import React, { useState, useEffect } from 'react';
import { ProfileState } from '../types';
import { Card } from './Card';
import { Gem, Clock, User, RefreshCw, Loader2, AlertTriangle, ChevronDown, ChevronUp, Copy, Check, Sparkles } from 'lucide-react';

interface AccountCardProps {
  profile: ProfileState;
  onClaim: (id: string) => void;
  onRefresh: (id: string) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({ profile, onClaim, onRefresh }) => {
  const [timeLeft, setTimeLeft] = useState<string>('--:--:--');
  const [isReady, setIsReady] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, status, config } = profile;

  useEffect(() => {
    if (!data) return;

    const calculateTime = () => {
      const now = Date.now();
      const diff = data.nextFreeGemsAt - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setIsReady(true);
        return;
      }

      setIsReady(false);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (num: number) => num.toString().padStart(2, '0');
      setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [data, data?.nextFreeGemsAt]);

  const isLoading = status === 'loading' || status === 'claiming';
  const isError = status === 'error';
  const isSuccess = status === 'success';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate progress percentage for the bar (assume 24h cycle for visuals or just static feedback)
  // A simple pulsing dot is cleaner for the "Ready" state.

  return (
    <Card 
      className={`
        relative overflow-hidden flex flex-col
        bg-white dark:bg-[#121214]/80 hover:bg-zinc-50 dark:hover:bg-[#18181b]/90
        ${isReady && !isLoading ? 'border-emerald-500/50 shadow-[0_0_30px_-10px_rgba(16,185,129,0.3)]' : 'border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-xl'}
      `}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin text-emerald-500" />
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-500 uppercase tracking-widest">Processing</span>
            </div>
        </div>
      )}

      {/* Header Section */}
      <div className="p-4 border-b border-white/5 flex justify-between items-start bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`
            w-9 h-9 rounded-lg flex items-center justify-center border transition-colors
            ${isReady ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-white/10 text-zinc-400 dark:text-zinc-500'}
          `}>
            <User size={16} />
          </div>
          <div className="flex flex-col overflow-hidden">
            <h3 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm truncate leading-tight">{config.name}</h3>
            <p className="text-[10px] text-zinc-500 truncate font-mono mt-0.5">
              {data?.email || config.cookies['gmail'] || '...'}
            </p>
          </div>
        </div>
        
        <button 
          onClick={(e) => { e.stopPropagation(); onRefresh(profile.id); }}
          className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors"
          title="Refresh Profile"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Body Section */}
      {data ? (
        <div className="flex-1 p-4 flex flex-col">
          
          {/* Main Stats Row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Gems */}
            <div className="bg-zinc-50 dark:bg-black/40 rounded-lg p-3 border border-zinc-200 dark:border-white/5 relative group">
              <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Gem size={10} className="text-purple-500" /> Balance
              </div>
              <div className="text-xl font-mono font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                {data.gems.toLocaleString()}
              </div>
            </div>

            {/* Timer */}
            <div className={`rounded-lg p-3 border relative group transition-colors ${isReady ? 'bg-emerald-500/5 dark:bg-emerald-900/10 border-emerald-500/20' : 'bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/5'}`}>
               <div className="text-[9px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1 transition-colors">
                {isReady ? (
                     <span className="text-emerald-500 flex items-center gap-1">
                         <Sparkles size={10} /> Ready
                     </span>
                ) : (
                    <span className="text-zinc-500 flex items-center gap-1">
                        <Clock size={10} /> Next
                    </span>
                )}
              </div>
              <div className={`text-xl font-mono font-bold transition-colors ${isReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                {isReady ? 'Now' : timeLeft}
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-3">
            {/* Status Messages */}
            {isSuccess && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded px-3 py-2 flex items-center gap-2 text-[11px] text-emerald-400 animate-in fade-in zoom-in-95 duration-300">
                    <Check size={12} /> Claimed Successfully
                </div>
            )}
            
            {isError && profile.message && !profile.message.includes('CORS') && (
                <div className="bg-red-500/5 border border-red-500/10 rounded px-3 py-2 flex items-center gap-2 text-[11px] text-red-400">
                    <AlertTriangle size={12} /> {profile.message}
                </div>
            )}

            {/* Main Action Button */}
            <button
              onClick={() => onClaim(profile.id)}
              disabled={!isReady || isLoading}
              className={`
                w-full py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 border
                ${isReady 
                    ? 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white border-transparent shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_-5px_rgba(16,185,129,0.6)] translate-y-0' 
                    : 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-600 border-zinc-200 dark:border-white/5 cursor-not-allowed hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }
              `}
            >
               {isReady ? (
                 <>Claim Credits <Gem size={12} className="animate-pulse" /></>
               ) : (
                 <span className="opacity-50">Wait for Timer</span>
               )}
            </button>
          </div>

          {/* Metadata Drawer */}
          <div className="mt-3 pt-3 border-t border-white/5">
             <button 
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-between text-[10px] font-medium text-zinc-500 dark:text-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-400 transition-colors uppercase tracking-wider"
             >
                <span>Metadata</span>
                <ChevronDown size={10} className={`transition-transform duration-300 ${showDetails ? 'rotate-180' : ''}`} />
             </button>
             
             <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${showDetails ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="mt-3 space-y-1.5 text-[10px]">
                        <div className="flex justify-between items-center p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors group/copy">
                            <span className="text-zinc-500">ID</span>
                            <div className="flex items-center gap-1.5">
                                <span className="font-mono text-zinc-400 truncate max-w-[80px]">{data.id}</span>
                                <button onClick={() => copyToClipboard(data.id)} className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-800 dark:hover:text-white opacity-0 group-hover/copy:opacity-100 transition-opacity">
                                    {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">
                            <span className="text-zinc-500">Referral</span>
                            <div className="flex flex-col items-end">
                                <span className="text-emerald-500/80 font-mono">{data.referralCode}</span>
                                <span className="text-[9px] text-zinc-600">{data.referralCodeUses}/{data.referralLimit} Used</span>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
          </div>

        </div>
      ) : (
        /* Error / Offline State */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
             {isLoading ? (
                 // Initial Loading Skeleton
                 <div className="space-y-3 w-full opacity-50">
                    <div className="h-16 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg animate-pulse"></div>
                    <div className="h-8 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg animate-pulse w-2/3 mx-auto"></div>
                 </div>
            ) : (
                 <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95">
                    <div className="p-3 bg-red-500/10 rounded-full text-red-500 border border-red-500/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]">
                        <AlertTriangle size={20} />
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-300 block">Connection Failed</span>
                        <p className="text-[10px] text-zinc-500 max-w-[180px] leading-relaxed">
                            {isError && profile.message?.includes('CORS') 
                                ? "Cross-Origin Request Blocked." 
                                : "Unable to reach server."}
                        </p>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRefresh(profile.id); }}
                        className="mt-2 text-[10px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-4 py-2 rounded border border-zinc-200 dark:border-zinc-700 transition-all hover:border-zinc-300 dark:hover:border-zinc-500"
                    >
                        Try Again
                    </button>
                </div>
            )}
        </div>
      )}
    </Card>
  );
};