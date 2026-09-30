import React, { useState, useEffect } from 'react';
import { X, UserPlus, Eye, EyeOff, Clipboard, AlertCircle, Loader2 } from 'lucide-react';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, token: string) => Promise<void> | void;
  existingNames: string[];
  suggestedName?: string;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingNames,
  suggestedName = ''
}) => {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(suggestedName);
      setToken('');
      setShowToken(false);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, suggestedName]);

  if (!isOpen) return null;

  const sanitizeToken = (raw: string) => {
    let t = raw.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1).trim();
    }
    if (t.toLowerCase().startsWith('bearer ')) {
      t = t.slice(7).trim();
    }
    return t;
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          setToken(sanitizeToken(clipText));
          setError(null);
        }
      }
    } catch (e) {
      // Permission denied or not supported
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmedName = name.trim() || suggestedName || 'Account';
    const sanitizedToken = sanitizeToken(token);

    if (!trimmedName) {
      setError('Please provide an account name or leave default.');
      return;
    }

    if (existingNames.some(n => n.toLowerCase() === trimmedName.toLowerCase())) {
      setError(`An account named "${trimmedName}" already exists.`);
      return;
    }

    if (!sanitizedToken) {
      setError('Please enter or paste the session token.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onAdd(trimmedName, sanitizedToken);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to add account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-md bg-white dark:bg-[#121214] border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-white/5 flex justify-between items-center bg-gradient-to-b from-zinc-50 to-white dark:from-white/[0.03] dark:to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">Add Account</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Connect a new session token</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Account Name */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                Account Name
              </label>
              <span className="text-[10px] text-zinc-400">Auto-detected if left default</span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={suggestedName || "e.g. Saahiyo, Main, Farming..."}
              className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              autoFocus
            />
          </div>

          {/* Session Token / Cookies */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                Session Token / Cookies / Curl
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
                  title="Paste from clipboard"
                >
                  <Clipboard size={12} />
                  Paste
                </button>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium flex items-center gap-1 transition-colors"
                >
                  {showToken ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Paste token, cookie string, or full curl command..."
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Supports Better-Auth token, Auth.js token, or full DevTools curl.
            </p>
            <div className="mt-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span>✨ Google profile name, Gmail, and avatar are automatically detected.</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 dark:text-red-400 flex items-center gap-2 animate-in fade-in duration-150">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  Add Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
