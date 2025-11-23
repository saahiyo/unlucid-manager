import React, { useEffect, useState } from 'react';
import { Diamond } from 'lucide-react';

interface PreloaderProps {
  onFinish: () => void;
  isLoading: boolean;
}

export const Preloader: React.FC<PreloaderProps> = ({ onFinish, isLoading }) => {
  const [exiting, setExiting] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2000); // Show for at least 2 seconds

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isLoading && minTimeElapsed && !exiting) {
        setExiting(true);
        setTimeout(onFinish, 500); // Wait for exit animation
    }
  }, [isLoading, minTimeElapsed, onFinish, exiting]);

  if (exiting) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b] transition-opacity duration-500 opacity-0 pointer-events-none">
             <div className="relative flex flex-col items-center">
                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)] animate-pulse">
                    <Diamond size={32} className="text-black fill-current" />
                </div>
            </div>
        </div>
      )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]">
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)] animate-bounce">
                <Diamond size={32} className="text-black fill-current" />
            </div>
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full animate-ping"></div>
        </div>
        
        <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white leading-none">
                UNLUCID<span className="text-zinc-500 font-light ml-1">MANAGER</span>
            </h1>
            <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
            </div>
        </div>
      </div>
    </div>
  );
};
