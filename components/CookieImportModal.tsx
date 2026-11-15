import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, FileJson } from 'lucide-react';
import { getPrimaryToken, parseCookiesInput } from '../cookieUtils';

interface CookieImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cookies: { name: string; token: string }[]) => void;
  initialData?: { name: string; token: string }[];
}

export function CookieImportModal({ isOpen, onClose, onSave, initialData = [] }: CookieImportModalProps) {
  const [accounts, setAccounts] = useState<{ name: string; token: string; id: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData.length > 0) {
        setAccounts(initialData.map((d, i) => ({ ...d, id: `init-${i}` })));
      } else {
        setAccounts([{ name: '', token: '', id: 'new-0' }]);
      }
    }
  }, [isOpen, initialData]);

  const handleAddRow = () => {
    setAccounts([...accounts, { name: '', token: '', id: `new-${Date.now()}` }]);
  };

  const handleRemoveRow = (id: string) => {
    setAccounts(accounts.filter(a => a.id !== id));
  };

  const handleChange = (id: string, field: 'name' | 'token', value: string) => {
    setAccounts(accounts.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleSave = () => {
    const validAccounts = accounts.filter(a => a.name.trim() !== '' && a.token.trim() !== '');
    const seenTokens = new Set<string>();
    const deduplicated: { name: string; token: string }[] = [];

    for (const acc of validAccounts) {
      const parsedCookies = parseCookiesInput(acc.token);
      const tokenKey = getPrimaryToken(parsedCookies) || acc.token.trim();
      if (!seenTokens.has(tokenKey)) {
        seenTokens.add(tokenKey);
        deduplicated.push({ name: acc.name.trim(), token: acc.token.trim() });
      }
    }

    onSave(deduplicated);
    onClose();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        const newAccounts: { name: string; token: string; id: string }[] = [];
        
        Object.entries(parsed).forEach(([name, cookies]: [string, any], index) => {
            if (cookies) {
                const tokenStr = typeof cookies === 'string' ? cookies : getPrimaryToken(cookies);
                if (tokenStr) {
                    newAccounts.push({
                        name: name,
                        token: tokenStr,
                        id: `imported-${Date.now()}-${index}`
                    });
                }
            }
        });

        if (newAccounts.length > 0) {
            setAccounts(prev => {
                const hasEmptyStart = prev.length === 1 && prev[0].name === '' && prev[0].token === '';
                if (hasEmptyStart) return newAccounts;
                return [...prev, ...newAccounts];
            });
        } else {
            alert("No valid cookies found in the file.");
        }
      } catch (err) {
        console.error("Failed to parse JSON", err);
        alert("Invalid JSON file");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#f2f3f5] dark:bg-[#121214] rounded-2xl shadow-xl border border-zinc-300/70 dark:border-white/10 flex flex-col max-h-[85vh]">
        
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/80 dark:border-white/5">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Import accounts
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Name + session token per row
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button 
                onClick={handleImportClick}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                title="Import from JSON"
            >
                <FileJson size={16} />
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".json" 
                className="hidden" 
            />
            <button 
                onClick={onClose}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
                <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3 px-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
              <div className="col-span-3">Name</div>
              <div className="col-span-8">Token</div>
              <div className="col-span-1"></div>
            </div>

            <div className="space-y-2">
              {accounts.map((account) => (
                <div key={account.id} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Name"
                      value={account.name}
                      onChange={(e) => handleChange(account.id, 'name', e.target.value)}
                      className="w-full px-3 py-2 bg-white/70 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500/60 transition-colors text-zinc-900 dark:text-white placeholder:text-zinc-400"
                    />
                  </div>
                  <div className="col-span-8">
                    <input
                      type="text"
                      placeholder="Session token"
                      value={account.token}
                      onChange={(e) => handleChange(account.id, 'token', e.target.value)}
                      className="w-full px-3 py-2 bg-white/70 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-500/60 transition-colors text-zinc-900 dark:text-white placeholder:text-zinc-400"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => handleRemoveRow(account.id)}
                      className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddRow}
              className="w-full py-2.5 border border-dashed border-zinc-300 dark:border-white/10 rounded-lg flex items-center justify-center gap-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-white/20 transition-colors text-xs font-medium"
            >
              <Plus size={14} />
              Add row
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-zinc-200/80 dark:border-white/5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Save import
          </button>
        </div>
      </div>
    </div>
  );
}
