import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hammer, Sparkles, UploadCloud, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ForgeProps {
  onImageSelect: (file: File) => void;
  isForging: boolean;
  error?: string | null;
}

export const Forge: React.FC<ForgeProps> = ({ onImageSelect, isForging, error }) => {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImageSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onImageSelect(e.target.files[0]);
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto perspective-1000">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative flex min-h-[460px] flex-col items-center justify-center rounded-3xl border-2 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-8 shadow-[0_0_60px_-20px_rgba(245,158,11,0.45)] transition-all duration-300",
          dragActive ? "scale-105 border-amber-400" : "border-slate-700",
          isForging && "animate-pulse border-amber-500/50"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-500/10 via-transparent to-indigo-500/10" />
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[url('https://www.transparenttextures.com/patterns/dark-denim-3.png')] opacity-20" />
        
        <AnimatePresence mode="wait">
          {isForging ? (
            <motion.div
              key="forging"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center space-y-6 z-10"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: [0, -45, 0] }}
                  transition={{ 
                    duration: 0.8, 
                    repeat: Infinity, 
                    repeatType: "reverse", 
                    ease: "easeInOut" 
                  }}
                >
                  <Hammer size={64} className="text-amber-400" />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="absolute -bottom-4 left-1/2 -translate-x-1/2"
                >
                  <Sparkles className="text-amber-200" size={32} />
                </motion.div>
              </div>
              <div className="text-center">
                <h3 className="animate-pulse text-2xl font-bold tracking-wider text-amber-300">SOUL IMPRINTING...</h3>
                <p className="mt-2 text-sm text-slate-400">Inscribing relic identity and battle memory</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center text-center space-y-4 z-10"
            >
              <div className="rounded-full border border-amber-500/30 bg-slate-800 p-4 shadow-inner shadow-black/40 transition-transform group-hover:scale-110">
                <UploadCloud size={48} className="text-slate-300 transition-colors group-hover:text-amber-400" />
              </div>
              
              <div>
                <h3 className="text-xl font-bold text-amber-100">Drop Relic Portrait</h3>
                <p className="mt-1 text-sm text-slate-400">or click to select from your armory</p>
              </div>

              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-gradient-to-r from-amber-500 to-yellow-300 px-6 py-2 font-bold text-black shadow-lg shadow-amber-500/20 transition-colors hover:from-amber-400 hover:to-yellow-200"
              >
                Select Material
              </button>
              
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg"
                >
                  <AlertCircle size={14} />
                  {error}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />
      </motion.div>
    </div>
  );
};
