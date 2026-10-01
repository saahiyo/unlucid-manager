// 'use client';
import React, { useState, useEffect } from 'react';
import { ProfileState } from '../types';
import { Card } from './Card';
import { 
  Gem, 
  Clock, 
  User, 
  RefreshCw, 
  Loader2, 
  AlertTriangle, 
  ChevronDown, 
  Copy, 
  Check, 
  Sparkles,
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
  onUpdate: (id: string, newName: string, newToken: string) => Promise<void> | void;
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

  // In-card edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.config.name);
  const [editToken, setEditToken] = useState(
    getPrimaryToken(profile.config.cookies)
  );
  const [showToken, setShowToken] = useState(false);
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  // Keep edit fields in sync if config changes
  useEffect(() => {
    setEditName(config.name);
    setEditToken(getPrimaryToken(config.cookies));
  }, [config.name, config.cookies]);

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
    const trimmedName = editName.trim();
    const trimmedToken = editToken.trim();

    if (!trimmedName) {
      setEditError("Account name cannot be empty");
      return;
    }
    if (!trimmedToken) {
      setEditError("Session token cannot be empty");
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      await onUpdate(profile.id, trimmedName, trimmedToken);
      setIsEditing(false);
      setIsDeletingConfirm(false);
    } catch (err: any) {
      setEditError(err.message || "Failed to update account");
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
      setEditName(config.name);
      setEditToken(config.cookies["__Secure-authjs.session-token"] || Object.values(config.cookies)[0] || "");
      setEditError(null);
    }
  };

  return (
    <Card 
      className={`
        relative overflow-hidden flex flex-col
        bg-white dark:bg-[#121214]/80 hover:bg-zinc-50 dark:hover:bg-[#18181b]/90
        ${isReady && !isLoading && !isEditing ? 'border-emerald-500/50 shadow-[0_0_30px_-10px_rgba(16,185,129,0.3)]' : 'border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-xl'}
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
      {isEditing ? (
        <div className="p-4 border-b border-zinc-200 dark:border-white/5 flex justify-between items-center bg-gradient-to-b from-white/[0.04] to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-500">
              <Key size={15} />
            </div>
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-800 dark:text-zinc-200">Edit Account</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Update credentials</p>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={() => {
              setIsEditing(false);
              setIsDeletingConfirm(false);
              setEditName(config.name);
              setEditToken(config.cookies["__Secure-authjs.session-token"] || Object.values(config.cookies)[0] || "");
              setEditError(null);
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors"
            title="Cancel Edit"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="p-4 border-b border-zinc-200 dark:border-white/5 flex justify-between items-start bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-center gap-3 overflow-hidden min-w-0">
            <div className={`
              w-9 h-9 rounded-lg flex items-center justify-center border transition-colors overflow-hidden shrink-0
              ${isReady ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-white/10 text-zinc-400 dark:text-zinc-500'}
            `}>
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
                <User size={16} />
              )}
            </div>
            <div className="flex flex-col overflow-hidden min-w-0">
              <h3 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm truncate leading-tight" title={data?.name || config.name}>
                {data?.name || config.name}
              </h3>
              <div 
                className="flex items-center gap-1 mt-0.5 group/email cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  const targetEmail = data?.email || config.cookies['gmail'];
                  if (targetEmail) copyEmailToClipboard(targetEmail);
                }}
                title={data?.email || config.cookies['gmail'] ? "Click to copy Gmail address" : ""}
              >
                <p className="text-[10px] truncate font-mono">
                  {data?.email || config.cookies['gmail'] || '...'}
                </p>
                {(data?.email || config.cookies['gmail']) && (
                  <span className="opacity-0 group-hover/email:opacity-100 transition-opacity shrink-0">
                    {copiedEmail ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setIsEditing(true); 
                setIsDeletingConfirm(false);
              }}
              className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors"
              title="Edit Account"
            >
              <Pencil size={13} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onRefresh(profile.id); }}
              className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors"
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
            {/* Auto-detected Google Account / Gmail Card */}
            {(data?.email || config.cookies['gmail'] || data?.name) && (
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
                    {data?.name && (
                      <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                        {data.name}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate leading-tight">
                      {data?.email || config.cookies['gmail']}
                    </p>
                  </div>
                </div>

                {(data?.email || config.cookies['gmail']) && (
                  <button
                    type="button"
                    onClick={() => copyEmailToClipboard(data?.email || config.cookies['gmail'])}
                    className="p-1 text-zinc-400 hover:text-emerald-500 dark:hover:text-emerald-400 rounded transition-colors shrink-0"
                    title="Copy Gmail"
                  >
                    {copiedEmail ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            )}

            {/* Account Name Field */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                Account Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  if (editError) setEditError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Account 1"
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-colors"
                autoFocus
              />
            </div>

            {/* Session Token Field */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Session Token
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
                  type={showToken ? "text" : "password"}
                  value={editToken}
                  onChange={(e) => {
                    setEditToken(e.target.value);
                    if (editError) setEditError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="__Secure-authjs.session-token..."
                  className="w-full px-3 py-2 pr-9 text-xs font-mono bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-colors"
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
                      setEditName(config.name);
                      setEditToken(config.cookies["__Secure-authjs.session-token"] || Object.values(config.cookies)[0] || "");
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
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={12} />
                        Save
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
          
          {/* Main Stats Row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Gems */}
            <div className="bg-zinc-50 dark:bg-black/40 rounded-lg p-3 border border-zinc-200 dark:border-white/5 relative group">
              <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Gem size={10} className="text-purple-500" /> Balance
              </div>
              <div className="text-xl font-mono font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors pt-2">
                <SlidingNumber value={data.gems} />
              </div>
            </div>

            {/* Timer */}
            <div className={`rounded-lg p-3 border relative group transition-colors ${isReady ? 'bg-emerald-500/5 dark:bg-emerald-900/10 border-emerald-500/20' : 'bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/5'}`}>
              <div className="text-[9px] font-bold uppercase tracking-wider mb-1 flex items-center justify-between transition-colors">
                {isReady ? (
                  <span className="text-emerald-500 flex items-center gap-1">
                    <Sparkles size={10} /> Ready
                  </span>
                ) : (
                  <span className="text-zinc-500 flex items-center gap-1">
                    <Clock size={10} /> Next
                  </span>
                )}
                {/* Adjust Timer button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTimer(!isEditingTimer);
                    setCustomTimerInput(timeLeft ? `${timeLeft.h}h ${timeLeft.m}m` : '');
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-emerald-500 text-zinc-400 dark:text-zinc-500 transition-all p-0.5 rounded"
                  title="Adjust claim timer (e.g. 9h 50m)"
                >
                  <Pencil size={10} />
                </button>
              </div>

              {isEditingTimer ? (
                <form onSubmit={handleSaveCustomTimer} className="pt-0.5 space-y-1">
                  <input
                    type="text"
                    value={customTimerInput}
                    onChange={(e) => setCustomTimerInput(e.target.value)}
                    placeholder="9h 50m or 9:50"
                    autoFocus
                    className="w-full text-xs font-mono bg-white dark:bg-zinc-900 border border-emerald-500/50 rounded px-1.5 py-1 text-zinc-800 dark:text-white focus:outline-none"
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsEditingTimer(false)}
                      className="text-[9px] px-1.5 py-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="text-[9px] px-2 py-0.5 bg-emerald-500 text-white font-bold rounded hover:bg-emerald-600"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <div 
                  onClick={() => {
                    setIsEditingTimer(true);
                    setCustomTimerInput(timeLeft ? `${timeLeft.h}h ${timeLeft.m}m` : '');
                  }}
                  className={`text-xl font-mono font-bold transition-colors cursor-pointer select-none ${isReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}
                  title="Click to adjust timer"
                >
                  {isReady ? 'Now' : (
                    timeLeft ? (
                      <div className="flex items-center">
                        <SlidingNumber value={timeLeft.h} padStart />
                        <span className="mx-[1px]">:</span>
                        <SlidingNumber value={timeLeft.m} padStart />
                        <span className="mx-[1px]" >:</span>
                        <SlidingNumber value={timeLeft.s} padStart />
                      </div>
                    ) : '--:--:--'
                  )}
                </div>
              )}
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
                    {isAuthError ? (
                      <div className="p-3 bg-amber-500/10 rounded-full text-amber-500 border border-amber-500/20 shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]">
                        <Key size={20} />
                      </div>
                    ) : (
                      <div className="p-3 bg-red-500/10 rounded-full text-red-500 border border-red-500/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]">
                        <AlertTriangle size={20} />
                      </div>
                    )}
                    <div className="space-y-1">
                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-300 block">
                          {isAuthError ? "Session Expired" : isError && profile.message?.includes('CORS') ? "CORS Blocked" : "Connection Failed"}
                        </span>
                        <p className="text-[10px] text-zinc-500 max-w-[200px] leading-relaxed">
                          {isAuthError 
                            ? "Signed out or expired on Unlucid. Please update session token."
                            : isError && profile.message?.includes('CORS') 
                                ? "Cross-Origin Request Blocked." 
                                : (profile.message || "Unable to reach server.")}
                        </p>
                    </div>
                     <div className="flex items-center gap-2 mt-2">
                       <button 
                           onClick={(e) => { e.stopPropagation(); onRefresh(profile.id); }}
                           className="text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-all hover:border-zinc-300 dark:hover:border-zinc-500"
                       >
                           Try Again
                       </button>
                       <button 
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             setIsEditing(true); 
                             setIsDeletingConfirm(false);
                           }}
                           className="text-[10px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20 transition-all hover:border-emerald-500/40"
                       >
                           Update Token
                       </button>
                     </div>
                 </div>
            )}
        </div>
      )}
    </Card>
  );
};