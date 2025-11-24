import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Upload } from 'lucide-react';

interface CookieImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cookies: { name: string; token: string }[]) => void;
  initialData?: { name: string; token: string }[];
}

export function CookieImportModal({ isOpen, onClose, onSave, initialData = [] }: CookieImportModalProps) {
  const [accounts, setAccounts] = useState<{ name: string; token: string; id: string }[]>([]);

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
    // Filter out empty rows
    const validAccounts = accounts.filter(a => a.name.trim() !== '' && a.token.trim() !== '');
    onSave(validAccounts);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white dark:bg-[#121214] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Upload size={20} className="text-emerald-500" />
              Import Cookies
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Add your accounts by providing a name and the <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono text-emerald-600 dark:text-emerald-400">__Secure-authjs.session-token</code> cookie value.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
              <div className="col-span-3">Name</div>
              <div className="col-span-8">Session Token</div>
              <div className="col-span-1"></div>
            </div>

            {/* Rows */}
            <div className="space-y-3">
              {accounts.map((account) => (
                <div key={account.id} className="grid grid-cols-12 gap-4 items-start group">
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Account Name"
                      value={account.name}
                      onChange={(e) => handleChange(account.id, 'name', e.target.value)}
                      className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
                    />
                  </div>
                  <div className="col-span-8">
                    <input
                      type="text"
                      placeholder="Paste __Secure-authjs.session-token here..."
                      value={account.token}
                      onChange={(e) => handleChange(account.id, 'token', e.target.value)}
                      className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center pt-2">
                    <button
                      onClick={() => handleRemoveRow(account.id)}
                      className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                      title="Remove row"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty State / Add Button */}
            <button
              onClick={handleAddRow}
              className="w-full py-3 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center gap-2 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all text-sm font-medium group"
            >
              <Plus size={16} className="group-hover:scale-110 transition-transform" />
              Add Another Account
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-b-2xl flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center gap-2"
          >
            <Save size={16} />
            Save & Import
          </button>
        </div>
      </div>
    </div>
  );
}
