import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Swords, Zap, Wind, Heart, Skull } from 'lucide-react';
import { cn } from '../lib/utils';
import type { CharacterData, Rarity, CardType } from '../lib/gameLogic';
import { calculateRarity, normalizeCardType } from '../lib/gameLogic';

interface HeroCardProps {
  character: CharacterData;
  image: string;
  className?: string;
  onClick?: () => void;
  isSelected?: boolean;
  infusions?: Array<{
    label: string;
    count: number;
    overlayClass: string;
    particleClass: string;
  }>;
  compact?: boolean;
}

const rarityConfig: Record<Rarity, {
  border: string;
  frame: string;
  glow: string;
  text: string;
  bg: string;
  gem: string;
}> = {
  common: {
    border: 'border-slate-600',
    frame: 'from-slate-700 via-slate-500 to-slate-800',
    glow: 'shadow-slate-500/20',
    text: 'text-slate-300',
    bg: 'bg-slate-900',
    gem: 'bg-slate-400',
  },
  rare: {
    border: 'border-cyan-500',
    frame: 'from-cyan-900 via-cyan-600 to-cyan-900',
    glow: 'shadow-cyan-500/40',
    text: 'text-cyan-200',
    bg: 'bg-slate-900',
    gem: 'bg-cyan-400',
  },
  epic: {
    border: 'border-violet-500',
    frame: 'from-violet-900 via-fuchsia-600 to-violet-900',
    glow: 'shadow-violet-500/50',
    text: 'text-fuchsia-200',
    bg: 'bg-slate-900',
    gem: 'bg-fuchsia-400',
  },
  mythic: {
    border: 'border-amber-500',
    frame: 'from-amber-700 via-yellow-500 to-orange-700',
    glow: 'shadow-amber-500/60',
    text: 'text-amber-200',
    bg: 'bg-slate-900',
    gem: 'bg-amber-400',
  },
};

const typeConfig: Record<CardType, { icon: React.ElementType; color: string; label: string }> = {
  warrior: { icon: Swords, color: 'text-orange-400', label: 'Warrior' },
  mage:    { icon: Zap, color: 'text-violet-400', label: 'Mage' },
  rogue:   { icon: Skull, color: 'text-rose-400', label: 'Rogue' },
  tank:    { icon: Shield, color: 'text-blue-400', label: 'Tank' },
  support: { icon: Heart, color: 'text-emerald-400', label: 'Support' },
};

const StatOrb = ({ icon: Icon, value, color }: { icon: React.ElementType, value: string | number, color: string }) => (
  <div className="relative group flex flex-col items-center justify-center">
    <div className={cn("relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-slate-950 shadow-lg transition-transform group-hover:scale-110", color)}>
      <Icon size={14} className="text-white" />
    </div>
    <div className="absolute -bottom-4 z-20 rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md border border-slate-700">
      {value}
    </div>
  </div>
);

export const HeroCard: React.FC<HeroCardProps> = ({ character, image, className, onClick, isSelected, infusions = [], compact = false }) => {
  const rarityKey = calculateRarity(parseInt(character.BP));
  const typeKey = normalizeCardType(character.state.TYPE);
  
  const rarity = rarityConfig[rarityKey];
  const type = typeConfig[typeKey];
  const TypeIcon = type.icon;
  const activeInfusions = infusions.filter((item) => item.count > 0);

  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative group perspective-1000 select-none transition-all duration-500", 
        className,
        onClick ? "cursor-pointer" : "",
        isSelected ? "scale-105 z-20" : "hover:scale-[1.02] hover:-translate-y-2 hover:z-10"
      )}
    >
      {/* Outer Glow for selection/hover */}
      <div className={cn(
        "absolute -inset-1 rounded-[24px] opacity-0 transition-opacity duration-500 blur-xl",
        isSelected ? "opacity-100" : "group-hover:opacity-70",
        rarityKey === 'mythic' ? 'bg-amber-500/40' : rarityKey === 'epic' ? 'bg-violet-500/40' : rarityKey === 'rare' ? 'bg-cyan-500/30' : 'bg-slate-500/20'
      )} />

      {/* Main Card Structure */}
      <div 
        className={cn(
          "relative h-full w-full overflow-hidden rounded-[22px] bg-slate-900 shadow-2xl transition-all duration-300",
          "border-[3px]",
          isSelected ? "border-white ring-2 ring-amber-400 ring-offset-2 ring-offset-black" : rarity.border
        )}
      >
        {/* Card Frame Texture (Metallic/Magical) */}
        <div className={cn("absolute inset-0 z-0 p-[4px] bg-gradient-to-br", rarity.frame)}>
          <div className="h-full w-full rounded-[16px] bg-slate-950/90 backdrop-blur-sm" />
        </div>

        {/* Content Container */}
        <div className="relative z-10 flex h-full flex-col p-[6px]">
          
          {/* Top Section: Image & Header */}
          <div className="relative aspect-[4/3.5] w-full overflow-hidden rounded-t-[14px] rounded-b-[4px] border-b-2 border-slate-800 bg-black">
            <img 
              src={image} 
              alt={character.name} 
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
            />
            
            {/* Top Bar: Cost/Type */}
            <div className="absolute left-0 top-0 w-full p-2 flex justify-between items-start z-20">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-amber-500/50 bg-slate-900/80 text-amber-400 shadow-lg backdrop-blur-md">
                <span className="font-bold text-xs">{character.BP.slice(0, 2)}</span>
              </div>
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2 bg-slate-900/80 shadow-lg backdrop-blur-md", type.color.replace('text-', 'border-'))}>
                <TypeIcon size={14} className={type.color} />
              </div>
            </div>

            {/* Rarity Gem (Bottom Center of Image) */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-30">
               <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-800 shadow-lg rotate-45", rarity.gem)}>
                 <div className="h-2 w-2 rounded-full bg-white/60 blur-[1px]" />
               </div>
            </div>

            {/* Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
            
             {/* Infusion Effects */}
            {activeInfusions.map((infusion, index) => (
              <motion.div
                key={`${infusion.label}-${index}`}
                initial={{ opacity: 0.2 }}
                animate={{ opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 3 + index, repeat: Infinity }}
                className={cn("pointer-events-none absolute inset-0 mix-blend-overlay", infusion.overlayClass)}
              />
            ))}
          </div>

          {/* Middle Section: Name & Stats */}
          <div className="relative mt-4 flex-1 rounded-b-[14px] bg-slate-900/50 p-2">
            
            {/* Name Banner */}
            <div className="mb-3 text-center">
              <h3 className={cn("font-serif text-lg font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-sm", compact ? "px-2 text-sm truncate whitespace-nowrap" : "")}>
                {character.name}
              </h3>
              <div className="mx-auto mt-1 h-[1px] w-1/2 bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
              <p className={cn("mt-0.5 text-[9px] font-bold uppercase tracking-widest opacity-70", rarity.text)}>
                {rarityKey} {type.label}
              </p>
            </div>

            {/* Stats Grid */}
            {!compact && (
              <div className="mb-3 grid grid-cols-4 gap-1 px-1">
                <StatOrb icon={Swords} value={character.state.ATK} color="border-orange-500/50" />
                <StatOrb icon={Shield} value={character.state.DEF} color="border-slate-500/50" />
                <StatOrb icon={Wind} value={character.state.SPEED} color="border-emerald-500/50" />
                <StatOrb icon={Heart} value={character.state.HP} color="border-rose-500/50" />
              </div>
            )}

            {/* Description / Flavor Text */}
            {!compact && (
              <div className="relative mt-2 min-h-[40px] rounded border border-slate-800 bg-slate-950/50 p-2">
                <p className="text-center font-serif text-[10px] italic leading-tight text-slate-500 line-clamp-3">
                  "{character.description || 'A legendary hero forged in the fires of code.'}"
                </p>
              </div>
            )}
            
            {/* Bottom Infusion Tags */}
            {activeInfusions.length > 0 && !compact && (
               <div className="mt-2 flex flex-wrap justify-center gap-1">
                {activeInfusions.map((infusion) => (
                  <span key={infusion.label} className={cn("rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-wider opacity-80", infusion.particleClass.replace('bg-', 'border-').replace('/80', ''), infusion.particleClass.replace('bg-', 'text-').replace('/80', ''))}>
                    {infusion.label}
                  </span>
                ))}
               </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
