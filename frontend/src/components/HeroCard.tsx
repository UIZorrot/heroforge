import React from 'react';
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
  color: string;
  label: string;
  lineClass: string;
  borderClass: string;
}> = {
  common: {
    color: '#71717a',
    label: 'COMMON',
    lineClass: 'from-zinc-600/0 via-zinc-500 to-zinc-600/0',
    borderClass: 'border-stone-800',
  },
  rare: {
    color: '#5078b4',
    label: 'RARE',
    lineClass: 'from-blue-500/0 via-blue-400 to-blue-500/0',
    borderClass: 'border-blue-900/30',
  },
  epic: {
    color: '#8c64b4',
    label: 'EPIC',
    lineClass: 'from-violet-500/0 via-violet-400 to-violet-500/0',
    borderClass: 'border-violet-900/35',
  },
  mythic: {
    color: '#b49664',
    label: 'MYTHIC',
    lineClass: 'from-amber-500/0 via-amber-400 to-amber-500/0',
    borderClass: 'border-gold-matte/50',
  },
};

const typeConfig: Record<CardType, { label: string }> = {
  warrior: { label: 'WARRIOR' },
  mage: { label: 'MAGE' },
  rogue: { label: 'ROGUE' },
  tank: { label: 'TANK' },
  support: { label: 'SUPPORT' },
};

export const HeroCard: React.FC<HeroCardProps> = ({ character, image, className, onClick, isSelected, infusions = [], compact = false }) => {
  const rarityKey = calculateRarity(parseInt(character.BP));
  const typeKey = normalizeCardType(character.state.TYPE);
  const rarity = rarityConfig[rarityKey];
  const type = typeConfig[typeKey];
  const activeInfusions = infusions.filter((item) => item.count > 0);
  const isMythic = rarityKey === 'mythic';
  const primarySkill = character.skill.s1?.name || 'No Skill';
  const secondarySkill = character.skill.s2?.name || 'No Skill';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden bg-[#0a0a0a] transition-all duration-500',
        className,
        onClick ? 'cursor-pointer' : '',
        isSelected ? 'z-20 scale-[1.01]' : 'hover:-translate-y-1'
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 z-20 w-[2px] bg-gradient-to-b', rarity.lineClass)} />
      <div className={cn('absolute inset-0 z-10 border border-hairline transition-colors', isMythic ? 'border-gold-matte/70' : rarity.borderClass)} />
      {isMythic && (
        <>
          <div className="absolute left-2 top-2 z-20 h-1 w-1 rotate-45 border border-gold-matte/80" />
          <div className="absolute right-2 top-2 z-20 h-1 w-1 rotate-45 border border-gold-matte/80" />
          <div className="absolute bottom-2 left-2 z-20 h-1 w-1 rotate-45 border border-gold-matte/80" />
          <div className="absolute bottom-2 right-2 z-20 h-1 w-1 rotate-45 border border-gold-matte/80" />
        </>
      )}
      <div className="relative h-[58%] overflow-hidden">
        <img
          src={image}
          alt={character.name}
          className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
        <div className="absolute right-3 top-3 flex items-baseline gap-1">
          <span className="font-mono text-2xl font-light tracking-wide text-stone-200">{character.BP}</span>
          <span className="text-[10px] tracking-widest text-stone-500">BP</span>
        </div>
        <div className="absolute left-3 top-3 border border-stone-700/80 bg-black/60 px-2 py-0.5 text-[10px] tracking-widest text-stone-300 backdrop-blur-sm">
          {type.label}
        </div>
      </div>
      <div className="flex h-[42%] flex-col justify-between bg-black/70 p-3 backdrop-blur-sm">
        <div className="space-y-1">
          <h3 className={cn('truncate text-base font-light tracking-extra-wide text-stone-100', compact ? 'text-sm' : '')}>{character.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] tracking-ultra-wide" style={{ color: rarity.color }}>
              {rarity.label}
            </span>
            <span className="text-[9px] tracking-widest text-stone-600">TYPE {type.label}</span>
          </div>
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] text-stone-300">
          <span>HP {character.state.HP}</span>
          <span>ATK {character.state.ATK}</span>
          <span>DEF {character.state.DEF}</span>
          <span>SPD {character.state.SPEED}</span>
        </div>
        {!compact && (
          <div className="flex flex-wrap gap-1.5">
            <span className="border border-hairline border-stone-700 px-2 py-0.5 text-[9px] tracking-wide text-stone-300">{primarySkill}</span>
            <span className="border border-hairline border-stone-700 px-2 py-0.5 text-[9px] tracking-wide text-stone-300">{secondarySkill}</span>
          </div>
        )}
        {!compact && activeInfusions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeInfusions.map((infusion) => (
              <span
                key={infusion.label}
                className="border border-hairline border-stone-700 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-stone-400"
              >
                {infusion.label} ×{infusion.count}
              </span>
            ))}
          </div>
        )}
      </div>
      {onClick && (
        <div className={cn('pointer-events-none absolute inset-0 border border-hairline opacity-0 transition-opacity duration-500 group-hover:opacity-100', isMythic ? 'border-gold-matte/70' : 'border-stone-600')} />
      )}
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 border border-gold-matte/70" />
      )}
      {activeInfusions.length > 0 && (
        <div className="pointer-events-none absolute inset-0 mix-blend-soft-light">
          {activeInfusions.slice(0, 2).map((infusion, index) => (
            <div key={`${infusion.label}-${index}`} className={cn('absolute inset-0 opacity-25', infusion.overlayClass)} />
          ))}
        </div>
      )}
    </div>
  );
};
