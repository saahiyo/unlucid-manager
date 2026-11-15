// 'use client';
import React, { useState, useEffect } from 'react';
import { ProfileState } from '../types';
import { Card } from './Card';
import { 
  User, 
  RefreshCw, 
  Loader2, 
  AlertTriangle, 
  ChevronDown, 
  Copy, 
  Check, 
  Pencil,
  Trash2,
  X,
  Eye,
  EyeOff,
  Save,
  Key,
  Mail
} from 'lucide-react';
import { SlidingNumber } from './motion-primitives/sliding-number';
import { getPrimaryToken } from '../cookieUtils';

interface AccountCardProps {
  profile: ProfileState;
  onClaim: (id: string) => void;
  onRefresh: (id: string) => void;
  /** Cookie-only update — gmail / id stay locked */
  onUpdate: (id: string, newToken: string) => Promise<void> | void;
  onDelete: (id: string) => void;
  onSetTimer?: (id: string, nextFreeGemsAt: number) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({ 
  profile, 
  onClaim, 
  onRefresh,
  onUpdate,
  onDelete,
  onSetTimer
}) => {
  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const { data, status, config } = profile;

  // In-card edit states (cookies only — identity is locked)
  const [isEditing, setIsEditing] = useState(false);
  const [editToken, setEditToken] = useState(
    getPrimaryToken(profile.config.cookies)
  );
  const [showToken, setShowToken] = useState(false);
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const lockedEmail = data?.email || config.email || config.cookies['gmail'];

  // Quick Timer adjustment state
  const [isEditingTimer, setIsEditingTimer] = useState(false);
  const [customTimerInput, setCustomTimerInput] = useState('');

  const handleSaveCustomTimer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const input = customTimerInput.trim().toLowerCase();
    if (!input) {
      setIsEditingTimer(false);
      return;
    }

    let totalMs = 0;
    const colonParts = input.split(':');
    if (colonParts.length === 2 || colonParts.length === 3) {
      const h = parseInt(colonParts[0], 10) || 0;
      const m = parseInt(colonParts[1], 10) || 0;
      const s = parseInt(colonParts[2] || '0', 10) || 0;
      totalMs = (h * 3600 + m * 60 + s) * 1000;
    } else {
      const hMatch = input.match(/(\d+)\s*h/);
      const mMatch = input.match(/(\d+)\s*m/);
      const sMatch = input.match(/(\d+)\s*s/);
      if (hMatch) totalMs += parseInt(hMatch[1], 10) * 3600 * 1000;
      if (mMatch) totalMs += parseInt(mMatch[1], 10) * 60 * 1000;
      if (sMatch) totalMs += parseInt(sMatch[1], 10) * 1000;

      if (totalMs === 0) {
        const num = parseFloat(input);
        if (!isNaN(num) && num > 0) totalMs = Math.round(num * 3600 * 1000);
      }
    }

    if (totalMs > 0 && onSetTimer) {
      const newNext = Date.now() + totalMs;
      onSetTimer(profile.id, newNext);
    }
    setIsEditingTimer(false);
    setCustomTimerInput('');
  };

  // Keep token field in sync if cookies change
  useEffect(() => {
    setEditToken(getPrimaryToken(config.cookies));
  }, [config.cookies]);

  useEffect(() => {
    if (!data) return;

    const calculateTime = () => {
      const now = Date.now();
      if (data.canClaimFreeGems) {
        setTimeLeft({ h: 0, m: 0, s: 0 });
        setIsReady(true);
        return;
      }

      const diff = (data.nextFreeGemsAt || 0) - now;

      if (diff <= 0) {
        setTimeLeft({ h: 0, m: 0, s: 0 });
        setIsReady(true);
        return;
      }

      setIsReady(false);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ h: hours, m: minutes, s: seconds });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [data, data?.nextFreeGemsAt, data?.canClaimFreeGems]);

  const isLoading = status === 'loading' || status === 'claiming';
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const isAuthError = Boolean(
    isError && (
      profile.message?.toLowerCase().includes('not signed in') ||
      profile.message?.includes('401') ||
      profile.message?.toLowerCase().includes('unauthorized') ||
      profile.message?.toLowerCase().includes('session')
    )
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyEmailToClipboard = (emailText: string) => {
    if (!emailText) return;
    navigator.clipboard.writeText(emailText);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleSaveEdit = async () => {
    const trimmedToken = editToken.trim();

    if (!trimmedToken) {
      setEditError('Paste a new session token / cookies');
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      await onUpdate(profile.id, trimmedToken);
      setIsEditing(false);
      setIsDeletingConfirm(false);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update cookies');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setIsDeletingConfirm(false);
      setEditToken(getPrimaryToken(config.cookies));
      setEditError(null);
    }
  };

  return (
    <Card 
      className={`
        relative overflow-hidden flex flex-col transition-colors duration-300
        bg-white/70 dark:bg-[#121214]/85 backdrop-blur-md
        ${isReady && !isLoading && !isEditing
          ? 'border-emerald-500/35 dark:border-emerald-500/30'
          : 'border-zinc-300/60 dark:border-white/[0.07]'}
      `}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 bg-[#09090b]/50 dark:bg-black/50 backdrop-blur-[1px] flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-emerald-500" />
        </div>
      )}

      {/* Header Section */}
      {isEditing ? (
        <div className="p-4 border-b border-zinc-200/80 dark:border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400">
              <Key size={14} />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-zinc-800 dark:text-zinc-200">Update cookies</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {lockedEmail ? 'Gmail stays locked — refresh session only' : 'Paste a new session token'}
              </p>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={() => {
              setIsEditing(false);
              setIsDeletingConfirm(false);
              setEditToken(getPrimaryToken(config.cookies));
              setEditError(null);
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors"
            title="Cancel Edit"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="p-4 border-b border-zinc-200/80 dark:border-white/5 flex justify-between items-start">
          <div className="flex items-center gap-3 overflow-hidden min-w-0">
            <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0 bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 ring-1 ring-zinc-200/80 dark:ring-white/10">
              {data?.image ? (
                <img 
                  src={data.image} 
                  alt={data?.name || config.name} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <User size={15} />
              )}
            </div>
            <div className="flex flex-col overflow-hidden min-w-0">
              <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm truncate leading-tight" title={data?.name || config.name}>
                {data?.name || config.name}
              </h3>
              <div 
                className="flex items-center gap-1 mt-0.5 group/email cursor-pointer text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (lockedEmail) copyEmailToClipboard(lockedEmail);
                }}
                title={lockedEmail ? 'Click to copy Gmail address' : ''}
              >
                <p className="text-[11px] truncate font-mono">
                  {lockedEmail || '...'}
                </p>
                {lockedEmail && (
                  <span className="opacity-0 group-hover/email:opacity-100 transition-opacity shrink-0">
                    {copiedEmail ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-0.5 shrink-0">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setIsEditing(true); 
                setIsDeletingConfirm(false);
              }}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors"
              title="Update cookies"
            >
              <Pencil size={13} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onRefresh(profile.id); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors"
              title="Refresh Profile"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Body Section */}
      {isEditing ? (
        <div className="flex-1 p-4 flex flex-col justify-between space-y-4 animate-in fade-in duration-200">
          <div className="space-y-3">
            {/* Locked identity — gmail recorded once, not editable */}
            <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden min-w-0">
                {data?.image ? (
                  <img
                    src={data.image}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Mail size={12} />
                  </div>
                )}
                <div className="overflow-hidden min-w-0">
                  <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                    {data?.name || config.name}
                  </p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate leading-tight">
                    {lockedEmail || 'Gmail locks after first successful sync'}
                  </p>
                </div>
              </div>

              {lockedEmail && (
                <button
                  type="button"
                  onClick={() => copyEmailToClipboard(lockedEmail)}
                  className="p-1 text-zinc-400 hover:text-emerald-500 dark:hover:text-emerald-400 rounded transition-colors shrink-0"
                  title="Copy Gmail"
                >
                  {copiedEmail ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              )}
            </div>

            {/* Session Token Field only */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  New session cookies
                </label>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors"
                >
                  {showToken ? <><EyeOff size={11} /> Hide</> : <><Eye size={11} /> Show</>}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={editToken}
                  onChange={(e) => {
                    setEditToken(e.target.value);
                    if (editError) setEditError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Paste token, cookie string, or curl…"
                  className="w-full px-3 py-2 pr-9 text-xs font-mono bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-colors"
                  autoFocus
                />
                {editToken && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(editToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                    title="Copy Token"
                  >
                    {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            </div>

            {editError && (
              <div className="text-[11px] text-red-500 dark:text-red-400 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-md">
                <AlertTriangle size={12} className="shrink-0" />
                <span>{editError}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-zinc-100 dark:border-white/5 space-y-2">
            {isDeletingConfirm ? (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2 animate-in fade-in duration-150">
                <p className="text-[11px] font-semibold text-red-500 dark:text-red-400 text-center">
                  Remove this account from dashboard?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDeletingConfirm(false)}
                    className="flex-1 py-1.5 text-xs font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(profile.id)}
                    className="flex-1 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeletingConfirm(true)}
                  className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                  title="Delete Account"
                >
                  <Trash2 size={14} />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditToken(getPrimaryToken(config.cookies));
                      setEditError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveEdit}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm shadow-emerald-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save size={12} />
                        Update cookies
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : data ? (
        <div className="flex-1 p-4 flex flex-col">
          {/* Stats — open typography, no nested boxes */}
          <div className="grid grid-cols-2 gap-6 mb-5">
            <div>
              <p className="text-[10px] font-medium tracking-wide uppercase text-zinc-400 dark:text-zinc-500 mb-1.5">
                Balance
              </p>
              <div className="text-2xl font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100 tracking-tight">
                <SlidingNumber value={data.gems} />
              </div>
            </div>

            <div className="group">
              <div className="flex items-center justify-between mb-1.5">
                <p className={`text-[10px] font-medium tracking-wide uppercase ${isReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                  {isReady ? 'Ready' : 'Next claim'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTimer(!isEditingTimer);
                    setCustomTimerInput(timeLeft ? `${timeLeft.h}h ${timeLeft.m}m` : '');
                  }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-opacity p-0.5"
                  title="Adjust claim timer"
                >
                  <Pencil size={10} />
                </button>
              </div>

              {isEditingTimer ? (
                <form onSubmit={handleSaveCustomTimer} className="space-y-1.5">
                  <input
                    type="text"
                    value={customTimerInput}
                    onChange={(e) => setCustomTimerInput(e.target.value)}
                    placeholder="9h 50m"
                    autoFocus
                    className="w-full text-xs font-mono bg-transparent border-b border-emerald-500/60 py-1 text-zinc-800 dark:text-white focus:outline-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setIsEditingTimer(false)} className="text-[10px] text-zinc-400 hover:text-zinc-600">Cancel</button>
                    <button type="submit" className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Save</button>
                  </div>
                </form>
              ) : (
                <div 
                  onClick={() => {
                    setIsEditingTimer(true);
                    setCustomTimerInput(timeLeft ? `${timeLeft.h}h ${timeLeft.m}m` : '');
                  }}
                  className={`text-2xl font-mono font-medium tabular-nums tracking-tight cursor-pointer select-none ${isReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}
                  title="Click to adjust timer"
                >
                  {isReady ? 'Now' : (
                    timeLeft ? (
                      <div className="flex items-center">
                        <SlidingNumber value={timeLeft.h} padStart />
                        <span className="mx-0.5 text-zinc-300 dark:text-zinc-600">:</span>
                        <SlidingNumber value={timeLeft.m} padStart />
                        <span className="mx-0.5 text-zinc-300 dark:text-zinc-600">:</span>
                        <SlidingNumber value={timeLeft.s} padStart />
                      </div>
                    ) : '—'
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto space-y-2.5">
            {isSuccess && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Check size={12} /> Claimed
              </div>
            )}
            
            {isError && profile.message && !profile.message.includes('CORS') && (
              <div className="flex items-center gap-2 text-[11px] text-red-500">
                <AlertTriangle size={12} /> {profile.message}
              </div>
            )}

            <button
              onClick={() => onClaim(profile.id)}
              disabled={!isReady || isLoading}
              className={`
                w-full py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-2
                ${isReady 
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                    : 'bg-zinc-100 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                }
              `}
            >
              {isReady ? 'Claim gems' : 'Waiting'}
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-200/70 dark:border-white/5">
             <button 
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-between text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
             >
                <span>Details</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
             </button>
             
             <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${showDetails ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="mt-2.5 space-y-1 text-[11px]">
                        <div className="flex justify-between items-center py-1.5 group/copy">
                            <span className="text-zinc-400">ID</span>
                            <div className="flex items-center gap-1.5">
                                <span className="font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-[100px]">{data.id}</span>
                                <button onClick={() => copyToClipboard(data.id || '')} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 opacity-0 group-hover/copy:opacity-100 transition-opacity">
                                    {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center py-1.5">
                            <span className="text-zinc-400">Referral</span>
                            <span className="font-mono text-zinc-500 dark:text-zinc-400">
                              {data.referralCode}
                              <span className="text-zinc-400 dark:text-zinc-600 ml-1.5">{data.referralCodeUses}/{data.referralLimit}</span>
                            </span>
                        </div>
                    </div>
                </div>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
             {isLoading ? (
                 <div className="space-y-3 w-full opacity-40">
                    <div className="h-10 bg-zinc-200 dark:bg-zinc-800/50 rounded-md animate-pulse"></div>
                    <div className="h-8 bg-zinc-200 dark:bg-zinc-800/50 rounded-md animate-pulse w-1/2 mx-auto"></div>
                 </div>
            ) : (
                 <div className="flex flex-col items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isAuthError ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-500'}`}>
                      {isAuthError ? <Key size={16} /> : <AlertTriangle size={16} />}
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
                          {isAuthError ? "Session expired" : isError && profile.message?.includes('CORS') ? "CORS blocked" : "Connection failed"}
                        </span>
                        <p className="text-[11px] text-zinc-500 max-w-[200px] leading-relaxed">
                          {isAuthError 
                            ? "Update the session token to reconnect."
                            : isError && profile.message?.includes('CORS') 
                                ? "Cross-origin request blocked." 
                                : (profile.message || "Unable to reach server.")}
                        </p>
                    </div>
                     <div className="flex items-center gap-2 mt-1">
                       <button 
                           onClick={(e) => { e.stopPropagation(); onRefresh(profile.id); }}
                           className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                       >
                           Retry
                       </button>
                       <button 
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             setIsEditing(true); 
                             setIsDeletingConfirm(false);
                           }}
                           className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors"
                       >
                           Update token
                       </button>
                     </div>
                 </div>
            )}
        </div>
      )}
    </Card>
  );
};