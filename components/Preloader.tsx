import React, { useEffect, useState } from 'react';
import { Diamond } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PreloaderProps {
  onFinish: () => void;
  isLoading: boolean;
}

export const Preloader: React.FC<PreloaderProps> = ({ onFinish, isLoading }) => {
  const [visible, setVisible] = useState(true);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isLoading && minTimeElapsed && visible) {
      const exitTimer = setTimeout(() => setVisible(false), 120);
      return () => clearTimeout(exitTimer);
    }
  }, [isLoading, minTimeElapsed, visible]);

  return (
    <AnimatePresence onExitComplete={onFinish}>
      {visible && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#e8eaee] dark:bg-[#09090b]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="flex flex-col items-center gap-5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="w-11 h-11 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Diamond size={20} className="text-black fill-current" />
            </div>

            <div className="flex flex-col items-center gap-2.5">
              <h1 className="text-sm font-semibold tracking-[0.22em] uppercase text-zinc-900 dark:text-zinc-100">
                Unlucid
              </h1>
              <div className="w-8 h-px bg-zinc-300 dark:bg-zinc-700 overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
