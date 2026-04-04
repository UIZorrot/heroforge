import { motion } from 'framer-motion';
import { ChevronRight, Sparkles, Wand2, Sword, Shield, PlayCircle } from 'lucide-react';
import type { SectionKey } from '../types';

interface LandingPageProps {
  onNavigate: (section: SectionKey) => void;
  isAuthenticated: boolean;
}

export function LandingPage({ onNavigate, isAuthenticated }: LandingPageProps) {
  return (
    <div className="relative min-h-[85vh] w-full overflow-hidden rounded-[2rem] border border-[#c59a5a]/20 bg-black/40 backdrop-blur-3xl shadow-[0_0_80px_rgba(197,154,90,0.05)]">
      {/* Background Arcane Glows */}
      <motion.div 
        className="pointer-events-none absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-[#c59a5a]/10 blur-[120px]"
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div 
        className="pointer-events-none absolute -right-40 bottom-0 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[150px]"
        animate={{ opacity: [0.2, 0.5, 0.2], x: [0, -30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-20 text-center lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c59a5a]/30 bg-[#c59a5a]/10 px-4 py-1.5 backdrop-blur-md"
        >
          <Sparkles size={14} className="text-[#f0d8ad]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#f0d8ad]">Next-Gen AI Card Battler</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="mx-auto max-w-4xl text-5xl font-light tracking-[0.2em] text-white md:text-7xl lg:text-8xl"
          style={{ textShadow: '0 0 40px rgba(197,154,90,0.3)' }}
        >
          FORGE YOUR <br />
          <span className="bg-gradient-to-r from-[#f0d8ad] via-[#c59a5a] to-[#8b6939] bg-clip-text font-serif font-black italic tracking-widest text-transparent drop-shadow-lg">
            LEGACY
          </span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
          className="mx-auto mt-8 max-w-2xl text-base leading-relaxed tracking-wide text-stone-400 md:text-lg"
        >
          Upload any image and let our arcane AI engine forge it into a powerful, unique battle card. Build your ultimate deck, train in the simulator, and dominate the PvP Arena.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
          className="mt-12 flex flex-col items-center gap-6 sm:flex-row"
        >
          <button 
            onClick={() => onNavigate(isAuthenticated ? 'forge' : 'profile')}
            className="group relative flex items-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-[#c59a5a] to-[#8b6939] px-8 py-4 px-10 transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(197,154,90,0.4)] hover:ring-2 hover:ring-[#f0d8ad]/50"
          >
            <span className="relative z-10 text-sm font-bold uppercase tracking-[0.2em] text-black">
              {isAuthenticated ? 'Start Forging' : 'Login to Play'}
            </span>
            <ChevronRight size={18} className="relative z-10 text-black transition-transform group-hover:translate-x-1" />
            <div className="absolute inset-0 z-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>

          <button 
            onClick={() => onNavigate('arena')}
            className="group flex items-center gap-3 rounded-full border border-stone-700 bg-black/50 px-8 py-4 transition-all hover:border-[#c59a5a]/50 hover:bg-[#c59a5a]/10"
          >
            <PlayCircle size={18} className="text-stone-400 group-hover:text-[#f0d8ad]" />
            <span className="text-sm font-light uppercase tracking-[0.2em] text-stone-300 group-hover:text-[#f0d8ad]">
              Watch Arena Match
            </span>
          </button>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.9 }}
          className="mt-24 grid w-full max-w-6xl gap-6 sm:grid-cols-3"
        >
          <FeatureCard 
            icon={Wand2} 
            title="AI Generation" 
            description="Transform images into fully stated cards with unique synergies and rarities." 
            onClick={() => onNavigate('forge')}
          />
          <FeatureCard 
            icon={Shield} 
            title="Tactical Vault" 
            description="Manage your collection, upgrade relics, and construct unbeatable team compositions." 
            onClick={() => onNavigate('vault')}
          />
          <FeatureCard 
            icon={Sword} 
            title="PvP Arena" 
            description="Test your creations in the 4v4 auto-battler arena against players globally." 
            onClick={() => onNavigate('arena')}
          />
        </motion.div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-stone-800/80 bg-black/40 p-6 text-left backdrop-blur-sm transition-all hover:-translate-y-2 hover:border-[#c59a5a]/40 hover:bg-black/60 hover:shadow-[0_10px_40px_rgba(197,154,90,0.1)]"
    >
      <div className="mb-4 inline-flex rounded-xl border border-[#c59a5a]/20 bg-[#c59a5a]/10 p-3 transition-colors group-hover:bg-[#c59a5a]/20">
        <Icon size={24} className="text-[#c59a5a] group-hover:text-[#f0d8ad]" />
      </div>
      <h3 className="mb-2 text-lg font-light tracking-[0.1em] text-stone-200 group-hover:text-white">{title}</h3>
      <p className="text-xs leading-relaxed tracking-wide text-stone-500 group-hover:text-stone-400">{description}</p>
    </div>
  );
}
