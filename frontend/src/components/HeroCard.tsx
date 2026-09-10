import { cn } from '../lib/utils';
import type { CharacterData, CardType, Rarity } from '../lib/gameLogic';
import { POWER_TIER_LABEL, normalizeCardType, powerTierFromBp, resolveRarity, toNumber } from '../lib/gameLogic';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { StatPill } from './Effects';

interface HeroCardProps {
  character: CharacterData;
  image?: string;
  className?: string;
  onClick?: () => void;
  isSelected?: boolean;
  statusLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}

const rarityConfig: Record<Rarity, { label: string; accent: string; border: string }> = {
  common: { label: 'COMMON', accent: 'text-stone-500', border: 'border-stone-800' },
  rare: { label: 'RARE', accent: 'text-sky-300', border: 'border-sky-400/20' },
  epic: { label: 'EPIC', accent: 'text-violet-300', border: 'border-violet-400/20' },
  mythic: { label: 'MYTHIC', accent: 'text-[#f0d8ad]', border: 'border-[#c59a5a]/50' },
};

const typeLabel: Record<CardType, string> = {
  warrior: 'WARRIOR',
  mage: 'MAGE',
  rogue: 'ROGUE',
  tank: 'TANK',
  support: 'SUPPORT',
};

function statValue(value: string | number | undefined) {
  return toNumber(value ?? 0, 0);
}

export function HeroCard({
  character,
  image,
  className,
  onClick,
  isSelected,
  statusLabel,
  disabled,
  compact = false,
}: HeroCardProps) {
  const rarityKey = resolveRarity(character);
  const rarity = rarityConfig[rarityKey];
  const powerTier = POWER_TIER_LABEL[powerTierFromBp(statValue(character.BP))];
  const typeKey = normalizeCardType(character.state.TYPE);

  const imageSrc = image || CARD_FALLBACK_SRC;

  const imageNode = imageSrc ? (
    <img
      src={imageSrc}
      alt={character.name}
      className="h-full w-full object-cover object-top transition duration-700 group-hover:scale-[1.03]"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(197,154,90,0.18),rgba(0,0,0,0.85)_70%)]">
      <div className="text-center">
        <div className="text-5xl font-light tracking-[0.25em] text-stone-200">{character.name.slice(0, 1).toUpperCase()}</div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.32em] text-stone-500">{typeLabel[typeKey]}</div>
      </div>
    </div>
  );

  return (
    <div
      onClick={onClick}
      className={cn(
        'portrait-card group relative w-full overflow-hidden border bg-[#090909] text-left transition duration-300',
        rarity.border,
        disabled ? 'opacity-55 grayscale-[0.35]' : '',
        isSelected ? 'scale-[1.01] border-[#c59a5a]/70 shadow-[0_0_0_1px_rgba(197,154,90,0.25)]' : 'hover:-translate-y-1 hover:border-stone-600',
        onClick && !disabled ? 'cursor-pointer' : '',
        className
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_28%,rgba(0,0,0,0.3))]" />
      <div className="relative h-[58%] overflow-hidden">
        {imageNode}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black via-black/45 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className={cn('text-[10px] uppercase tracking-[0.28em]', rarity.accent)}>{rarity.label}</span>
          <span className="border border-white/10 bg-black/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.28em] text-stone-300">
            {typeLabel[typeKey]}
          </span>
          {statusLabel && (
            <span className="border border-rose-300/30 bg-rose-400/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.24em] text-rose-100">
              {statusLabel}
            </span>
          )}
        </div>
        <div className="absolute right-3 top-3 text-right">
          <div className="text-2xl font-light tracking-[0.12em] text-stone-100">{character.BP}</div>
          <div className="text-[9px] uppercase tracking-[0.3em] text-stone-500">BP · {powerTier}</div>
        </div>
      </div>

      <div className="flex h-[42%] min-h-0 flex-col overflow-hidden px-4 pb-4 pt-3">
        <div className="min-h-0 shrink">
          <h3 className={cn('font-light tracking-[0.08em] text-stone-100', compact ? 'text-base' : 'text-lg')}>
            {character.name}
          </h3>
          <p className={cn('mt-1 text-xs leading-5 text-stone-400', compact ? 'line-clamp-1' : 'line-clamp-2')}>
            {character.description}
          </p>
        </div>

        {!compact && (
          <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 text-xs text-stone-300">
            <div className="border border-white/5 bg-black/35 p-2">
              <div className="text-[9px] uppercase tracking-[0.22em] text-stone-500">Primary</div>
              <div className="mt-1 line-clamp-1">{character.skill.s1?.name || 'Untitled skill'}</div>
            </div>
            <div className="border border-white/5 bg-black/35 p-2">
              <div className="text-[9px] uppercase tracking-[0.22em] text-stone-500">Secondary</div>
              <div className="mt-1 line-clamp-1">{character.skill.s2?.name || 'Untitled skill'}</div>
            </div>
          </div>
        )}

        <div className={cn('mt-auto flex shrink-0 flex-wrap gap-2', compact ? 'pt-3' : 'pt-2')}>
          <StatPill label="HP" value={statValue(character.state.HP)} tone="slate" />
          <StatPill label="ATK" value={statValue(character.state.ATK)} tone="gold" />
          {!compact && (
            <>
              <StatPill label="DEF" value={statValue(character.state.DEF)} tone="violet" />
              <StatPill label="SPD" value={statValue(character.state.SPEED)} tone="emerald" />
            </>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 border border-transparent group-hover:border-[#c59a5a]/30" />
      {isSelected && <div className="pointer-events-none absolute inset-0 border border-[#c59a5a]/70" />}
      {disabled && <div className="pointer-events-none absolute inset-0 bg-black/20" />}
    </div>
  );
}
