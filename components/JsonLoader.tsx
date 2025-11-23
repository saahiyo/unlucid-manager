import React, { useState } from 'react';
import { UploadCloud, AlertTriangle, X } from 'lucide-react';
import { RawCookiesJson } from '../types';

interface JsonLoaderProps {
  onLoad: (data: RawCookiesJson) => void;
  onClose: () => void;
}

export const JsonLoader: React.FC<JsonLoaderProps> = ({ onLoad, onClose }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleParse = () => {
    try {
      const parsed = JSON.parse(input);
      // Basic validation
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid JSON format');
      }
      onLoad(parsed);
      onClose();
    } catch (e) {
      setError('Invalid JSON. Please check the format matches cookies.json.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-border">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-800 rounded-lg">
                    <UploadCloud size={20} className="text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Import Profiles</h2>
                    <p className="text-sm text-zinc-500">Paste content from cookies.json</p>
                </div>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white">
                <X size={24} />
            </button>
        </div>
        
        <div className="p-6">
          <textarea
            className="w-full h-64 bg-background border border-border rounded-xl p-4 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-700 resize-none"
            placeholder={`{
  "chrome": { "gmail": "...", "__Secure-authjs.session-token": "..." },
  "mobile": { ... }
}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          
          {error && (
            <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-3 bg-zinc-900/50">
            <button 
                onClick={onClose}
                className="px-4 py-2 text-zinc-400 hover:text-white font-medium text-sm"
            >
                Cancel
            </button>
            <button 
                onClick={handleParse}
                className="px-6 py-2 bg-white text-black rounded-lg font-bold text-sm hover:bg-zinc-200 transition-colors"
            >
                Load Profiles
            </button>
        </div>
      </div>
    </div>
  );
};
