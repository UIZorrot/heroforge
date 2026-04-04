import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, UploadCloud, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState } from './Effects';

interface ForgeProps {
  onImageSelect: (file: File) => void;
  isForging: boolean;
  error?: string | null;
  previewUrl?: string | null;
  onClearPreview?: () => void;
}

export function Forge({ onImageSelect, isForging, error, previewUrl, onClearPreview }: ForgeProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file?: File | null) => {
    if (!file || isForging) return;
    onImageSelect(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'group relative overflow-hidden border border-stone-800 bg-black/35 transition duration-300',
          dragActive ? 'border-[#c59a5a]/70' : 'hover:border-stone-600',
          isForging ? 'cursor-wait' : 'cursor-pointer'
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleDrop}
        onClick={() => {
          if (!isForging) inputRef.current?.click();
        }}
      >
        <AnimatePresence mode="wait">
          {isForging ? (
            <motion.div
              key="forging"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[360px] flex-col items-center justify-center gap-5 p-8 text-center"
            >
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-[#c59a5a]/30" />
                <div className="absolute inset-3 rounded-full border border-[#c59a5a]/60 border-t-transparent animate-spin" />
                <Sparkles className="relative z-10 text-[#f0d8ad]" size={24} />
              </div>
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-stone-200">Forging</div>
                <p className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-500">Analyzing image and generating hero data</p>
              </div>
            </motion.div>
          ) : previewUrl ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative min-h-[360px]"
            >
              <img src={previewUrl} alt="Preview" className="h-[360px] w-full object-cover object-top" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute left-5 top-5 flex items-center gap-2">
                <span className="border border-[#c59a5a]/30 bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-[#f0d8ad]">
                  Ready to forge
                </span>
                <span className="border border-white/10 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-stone-300">
                  Click or drag a new image
                </span>
              </div>
              {onClearPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearPreview();
                  }}
                  className="absolute right-4 top-4 border border-white/10 bg-black/60 p-2 text-stone-300 transition hover:border-[#c59a5a]/40 hover:text-[#f0d8ad]"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <div className="text-lg font-light tracking-[0.08em] text-stone-100">Image staged for forging</div>
                <p className="mt-1 text-sm text-stone-400">Upload accepted. Press Forge to generate a new hero.</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState
                title="Drop an image to forge a hero"
                description="The backend will analyze the image, choose a template, and generate final stats through the rule-based numeric engine."
                action={
                  <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-stone-500">
                    <UploadCloud size={14} />
                    Click to browse or drag-and-drop
                  </div>
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
