import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Plus } from 'lucide-react';
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
    <div className="relative mx-auto w-full max-w-3xl">
      <div
        className={cn(
          "relative transition-all duration-300 cursor-pointer block",
          isForging ? "cursor-wait" : ""
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          if (!isForging) inputRef.current?.click();
        }}
      >
        <div className={cn(
          "absolute inset-0 border-hairline transition-all duration-300 pointer-events-none z-10",
          dragActive ? "border-gold-matte/70" : isForging ? "border-gold-matte/35" : "border-stone-800 group-hover:border-stone-700"
        )}></div>

        <AnimatePresence mode="wait">
          {isForging ? (
            <motion.div
              key="forging"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="aspect-[3/2] flex flex-col items-center justify-center bg-transparent"
            >
              <MinimalSpinner large />
              <p className="text-stone-600 text-xs tracking-widest mt-8">EXTRACTING ESSENCE</p>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="aspect-[3/2] flex flex-col items-center justify-center gap-6 hover:bg-stone-950/30 transition-all group"
            >
              <div className="w-12 h-12 border-hairline border-stone-800 flex items-center justify-center transition-colors group-hover:border-stone-600 z-20">
                <Plus size={24} className="text-stone-700 group-hover:text-stone-500 transition-colors" />
              </div>
              <div className="text-center z-20">
                <p className="text-stone-600 text-xs tracking-widest mb-2 group-hover:text-stone-400 transition-colors">DROP IMAGE HERE</p>
                <p className="text-stone-800 text-xs tracking-wide">or click to browse</p>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-gold-matte/75 text-xs mt-4 tracking-widest z-20">
                  <AlertCircle size={14} />
                  {error}
                </div>
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
          disabled={isForging}
        />
      </div>
    </div>
  );
};

function MinimalSpinner({ large = false }: { large?: boolean }) {
  const size = large ? 'w-16 h-16' : 'w-10 h-10';
  return (
    <div className={`relative ${size} flex flex-col items-center justify-center z-20`}>
      <div className="absolute inset-1 rotate-45 border-hairline border-stone-800 border-t-gold-matte animate-spin-slow"></div>
    </div>
  );
}
