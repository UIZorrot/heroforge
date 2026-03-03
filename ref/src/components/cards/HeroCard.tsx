
import type { HeroCard as HeroCardType, Rarity, CardType } from '../../types/card';

interface HeroCardProps {
  card: HeroCardType;
  onClick?: () => void;
  isSelected?: boolean;
  showDetails?: boolean;
  compact?: boolean;
}

const rarityConfig: Record<Rarity, {
  border: string;
  glow: string;
  badge: string;
  badgeText: string;
  label: string;
  headerGrad: string;
  gem: string;
}> = {
  common: {
    border: 'border-gray-500/50',
    glow: 'hover:shadow-[0_0_20px_rgba(156,163,175,0.25)]',
    badge: 'bg-gray-700/80 border-gray-500/50',
    badgeText: 'text-gray-300',
    label: 'COMMON',
    headerGrad: 'from-gray-700/60 to-transparent',
    gem: 'bg-gray-400',
  },
  rare: {
    border: 'border-sky-500/60',
    glow: 'hover:shadow-[0_0_25px_rgba(14,165,233,0.35)]',
    badge: 'bg-sky-900/80 border-sky-500/50',
    badgeText: 'text-sky-300',
    label: 'RARE',
    headerGrad: 'from-sky-900/50 to-transparent',
    gem: 'bg-sky-400',
  },
  epic: {
    border: 'border-violet-500/70',
    glow: 'hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]',
    badge: 'bg-violet-900/80 border-violet-500/50',
    badgeText: 'text-violet-300',
    label: 'EPIC',
    headerGrad: 'from-violet-900/50 to-transparent',
    gem: 'bg-violet-400',
  },
  mythic: {
    border: 'border-amber-400/80',
    glow: 'hover:shadow-[0_0_40px_rgba(251,191,36,0.5)]',
    badge: 'bg-amber-900/80 border-amber-400/60',
    badgeText: 'text-amber-300',
    label: 'MYTHIC',
    headerGrad: 'from-amber-900/60 to-transparent',
    gem: 'bg-amber-400',
  },
};

const typeConfig: Record<CardType, { icon: string; color: string; label: string }> = {
  warrior: { icon: 'ri-sword-fill', color: 'text-orange-400', label: 'Warrior' },
  mage:    { icon: 'ri-magic-fill', color: 'text-violet-400', label: 'Mage' },
  rogue:   { icon: 'ri-knife-blood-fill', color: 'text-rose-400', label: 'Rogue' },
  tank:    { icon: 'ri-shield-fill', color: 'text-sky-400', label: 'Tank' },
  support: { icon: 'ri-heart-fill', color: 'text-emerald-400', label: 'Support' },
};

const skillTypeColor: Record<string, string> = {
  damage:  'bg-rose-900/60 border-rose-500/40 text-rose-300',
  control: 'bg-violet-900/60 border-violet-500/40 text-violet-300',
  buff:    'bg-amber-900/60 border-amber-500/40 text-amber-300',
  heal:    'bg-emerald-900/60 border-emerald-500/40 text-emerald-300',
};

export default function HeroCard({ card, onClick, isSelected, showDetails = true, compact = false }: HeroCardProps) {
  const rarity = rarityConfig[card.rarity];
  const type = typeConfig[card.type];

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-2xl overflow-hidden transition-all duration-300 select-none
        ${onClick ? 'cursor-pointer' : ''}
        ${isSelected
          ? 'ring-2 ring-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.5)] scale-[1.02]'
          : `${rarity.glow} hover:scale-[1.02] hover:-translate-y-1`
        }
      `}
    >
      {/* Outer border layer */}
      <div className={`absolute inset-0 rounded-2xl border-2 ${rarity.border} pointer-events-none z-20`}></div>

      {/* Mythic animated corner accents */}
      {card.rarity === 'mythic' && (
        <>
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-amber-400 rounded-tl-2xl z-30 pointer-events-none"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-amber-400 rounded-tr-2xl z-30 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-amber-400 rounded-bl-2xl z-30 pointer-events-none"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-amber-400 rounded-br-2xl z-30 pointer-events-none"></div>
        </>
      )}

      {/* Card body */}
      <div className="relative bg-gradient-to-b from-[#0f1117] to-[#0a0a0c] rounded-2xl overflow-hidden">

        {/* Hero Image */}
        <div className="relative w-full aspect-[3/4] overflow-hidden">
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-full h-full object-cover object-top transition-transform duration-500 hover:scale-105"
          />
          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/20 to-transparent"></div>
          <div className={`absolute inset-0 bg-gradient-to-b ${rarity.headerGrad} to-transparent`}></div>

          {/* Shimmer for mythic/epic */}
          {(card.rarity === 'mythic' || card.rarity === 'epic') && (
            <div className="absolute inset-0 shimmer pointer-events-none"></div>
          )}

          {/* Top badges row */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
            {/* Rarity badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-sm ${rarity.badge}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${rarity.gem} animate-pulse`}></div>
              <span className={`text-[10px] font-bold tracking-widest ${rarity.badgeText}`}>
                {rarity.label}
              </span>
            </div>

            {/* Type badge */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm">
              <div className={`w-4 h-4 flex items-center justify-center ${type.color}`}>
                <i className={`${type.icon} text-xs`}></i>
              </div>
              <span className="text-[10px] font-semibold text-gray-300">{type.label}</span>
            </div>
          </div>

          {/* Favorite star */}
          {card.isFavorite && (
            <div className="absolute bottom-3 right-3 z-10">
              <div className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-400/20 border border-amber-400/50">
                <i className="ri-star-fill text-amber-400 text-sm"></i>
              </div>
            </div>
          )}

          {/* BP badge on image */}
          <div className="absolute bottom-3 left-3 z-10">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 border border-amber-400/30 backdrop-blur-sm">
              <i className="ri-fire-fill text-amber-400 text-xs"></i>
              <span className="text-amber-300 font-mono font-bold text-sm">{card.bp}</span>
            </div>
          </div>
        </div>

        {/* Card Info Panel */}
        <div className="px-4 pt-3 pb-4 space-y-3">
          {/* Name & type */}
          <div>
            <h3 className={`font-display font-bold leading-tight ${compact ? 'text-base' : 'text-lg'} text-white`}>
              {card.name}
            </h3>
          </div>

          {showDetails && !compact && (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-1.5">
                <StatPill icon="ri-heart-fill" label="HP" value={card.hp} color="text-rose-400" bg="bg-rose-950/50 border-rose-800/40" />
                <StatPill icon="ri-sword-fill" label="ATK" value={card.atk} color="text-amber-400" bg="bg-amber-950/50 border-amber-800/40" />
                <StatPill icon="ri-shield-fill" label="DEF" value={card.def} color="text-sky-400" bg="bg-sky-950/50 border-sky-800/40" />
                <StatPill icon="ri-flashlight-fill" label="SPD" value={card.speed} color="text-emerald-400" bg="bg-emerald-950/50 border-emerald-800/40" />
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

              {/* Skills */}
              {card.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {card.skills.slice(0, 3).map((skill) => (
                    <span
                      key={skill.id}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${skillTypeColor[skill.type] || 'bg-gray-800 border-gray-600 text-gray-300'}`}
                    >
                      {skill.name}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, color, bg }: {
  icon: string; label: string; value: number; color: string; bg: string;
}) {
  return (
    <div className={`flex flex-col items-center py-1.5 px-1 rounded-lg border ${bg}`}>
      <div className={`w-4 h-4 flex items-center justify-center ${color} mb-0.5`}>
        <i className={`${icon} text-xs`}></i>
      </div>
      <span className="text-[9px] text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-mono font-bold text-gray-200">{value}</span>
    </div>
  );
}
