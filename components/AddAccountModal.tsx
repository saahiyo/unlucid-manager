import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Clipboard, AlertCircle, Loader2 } from 'lucide-react';
import { parseCookiesInput, getPrimaryToken } from '../cookieUtils';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, token: string) => Promise<void> | void;
  existingNames: string[];
  existingTokens?: { name: string; token: string }[];
  suggestedName?: string;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingNames,
  existingTokens = [],
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

    const newCookies = parseCookiesInput(sanitizedToken);
    const parsedPrimaryToken = getPrimaryToken(newCookies);

    if (parsedPrimaryToken && existingTokens.length > 0) {
      const duplicate = existingTokens.find(
        t => t.token && (t.token === parsedPrimaryToken || t.token.includes(parsedPrimaryToken) || parsedPrimaryToken.includes(t.token))
      );
      if (duplicate) {
        setError(`This session token is already in use by account "${duplicate.name}".`);
        return;
      }
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-md bg-[#f2f3f5] dark:bg-[#121214] border border-zinc-300/70 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="px-5 py-4 border-b border-zinc-200/80 dark:border-white/5 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Add account</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Paste a session token to connect</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={suggestedName || "Account name"}
              className="w-full px-3 py-2.5 text-sm bg-white/70 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/60 transition-colors"
              autoFocus
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[11px] font-medium text-zinc-500">
                Session token
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-medium flex items-center gap-1 transition-colors"
                >
                  <Clipboard size={11} />
                  Paste
                </button>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-medium flex items-center gap-1 transition-colors"
                >
                  {showToken ? <><EyeOff size={11} /> Hide</> : <><Eye size={11} /> Show</>}
                </button>
              </div>
            </div>

            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Token, cookie string, or curl…"
              className="w-full px-3 py-2.5 text-sm font-mono bg-white/70 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/60 transition-colors"
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 flex items-center gap-2">
              <AlertCircle size={13} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Connecting…
                </>
              ) : (
                'Add account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
