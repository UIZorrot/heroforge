
import { HeroCard as HeroCardType } from '../../types/card';

interface HeroCardProps {
  card: HeroCardType;
  onClick?: () => void;
  className?: string;
  showActions?: boolean;
  onDelete?: () => void;
  onFavorite?: () => void;
}

const rarityConfig = {
  common: { 
    color: '#71717a',
    label: 'COMMON'
  },
  rare: { 
    color: '#60a5fa',
    label: 'RARE'
  },
  epic: { 
    color: '#a78bfa',
    label: 'EPIC'
  },
  mythic: { 
    color: '#b49664',
    label: 'MYTHIC'
  }
};

const skillTypeColors = {
  damage: 'border-red-900/30 text-red-400/70',
  control: 'border-purple-900/30 text-purple-400/70',
  buff: 'border-amber-900/30 text-amber-400/70',
  heal: 'border-emerald-900/30 text-emerald-400/70'
};

export default function HeroCard({ 
  card, 
  onClick, 
  className = '',
  showActions = false,
  onDelete,
  onFavorite
}: HeroCardProps) {
  const rarity = rarityConfig[card.rarity] ?? rarityConfig.common;
  const isMythic = card.rarity === 'mythic';

  return (
    <div 
      className={`group relative bg-dark-900 overflow-hidden transition-all duration-500 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        aspectRatio: '2/3',
        borderRadius: '2px'
      }}
      onClick={onClick}
    >
      {/* 稀有度左侧竖线 */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-[2px] z-20"
        style={{ 
          background: `linear-gradient(to bottom, ${rarity.color}00, ${rarity.color}, ${rarity.color}00)`
        }}
      />

      {/* Mythic 四角装饰点 */}
      {isMythic && (
        <>
          <div className="absolute top-2 left-2 w-1 h-1 rotate-45 border border-gold-matte z-20" />
          <div className="absolute top-2 right-2 w-1 h-1 rotate-45 border border-gold-matte z-20" />
          <div className="absolute bottom-2 left-2 w-1 h-1 rotate-45 border border-gold-matte z-20" />
          <div className="absolute bottom-2 right-2 w-1 h-1 rotate-45 border border-gold-matte z-20" />
        </>
      )}

      {/* 极细边框 */}
      <div 
        className={`absolute inset-0 pointer-events-none z-10 ${
          isMythic ? 'border-gold-matte' : 'border-dark-800'
        }`}
        style={{ borderWidth: '0.5px' }}
      />

      {/* 图片区域 60% */}
      <div className="relative h-[60%] overflow-hidden">
        <img 
          src={card.imageUrl} 
          alt={card.name}
          className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
        />
        
        {/* 图片底部渐变遮罩 */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-dark-900 to-transparent" />

        {/* BP 显示在图片右上角 */}
        <div className="absolute top-3 right-3 flex items-baseline gap-1">
          <span className="font-mono text-2xl font-light tracking-wider text-white/90">
            {card.bp}
          </span>
          <span className="text-[10px] font-light tracking-widest text-white/40">
            BP
          </span>
        </div>

        {/* 收藏图标 */}
        {showActions && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite?.();
            }}
            className="absolute top-3 left-3 w-6 h-6 flex items-center justify-center text-white/40 hover:text-gold-matte transition-colors"
          >
            <i className={`${card.isFavorite ? 'ri-star-fill' : 'ri-star-line'} text-sm`} />
          </button>
        )}
      </div>

      {/* 信息区域 40% */}
      <div className="h-[40%] p-4 flex flex-col justify-between bg-dark-950/80 backdrop-blur-sm">
        {/* 名称和稀有度 */}
        <div className="space-y-1">
          <h3 className="text-base font-light tracking-extra-wide text-white/90 truncate">
            {card.name}
          </h3>
          <div className="flex items-center gap-2">
            <span 
              className="text-[9px] font-light tracking-ultra-wide"
              style={{ color: rarity.color }}
            >
              {rarity.label}
            </span>
            <span className="text-[9px] font-light tracking-widest text-white/20">
              {card.type.toUpperCase()}
            </span>
          </div>
        </div>

        {/* 属性数值 - 横排极简 */}
        <div className="flex items-center justify-between text-[11px] font-mono font-light">
          <div className="flex items-baseline gap-1">
            <span className="text-white/40 text-[9px] tracking-wider">HP</span>
            <span className="text-white/70">{card.hp}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-white/40 text-[9px] tracking-wider">ATK</span>
            <span className="text-white/70">{card.atk}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-white/40 text-[9px] tracking-wider">DEF</span>
            <span className="text-white/70">{card.def}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-white/40 text-[9px] tracking-wider">SPD</span>
            <span className="text-white/70">{card.speed}</span>
          </div>
        </div>

        {/* 技能标签 - 细边框空心胶囊 */}
        <div className="flex flex-wrap gap-1.5">
          {card.skills.slice(0, 3).map((skill, index) => (
            <span
              key={index}
              className={`px-2 py-0.5 text-[9px] font-light tracking-wider border ${
                skillTypeColors[skill.type as keyof typeof skillTypeColors]
              }`}
              style={{ 
                borderWidth: '0.5px',
                borderRadius: '10px'
              }}
            >
              {skill.name}
            </span>
          ))}
        </div>

        {/* 删除按钮 */}
        {showActions && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute bottom-3 right-3 w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400/70 transition-colors"
          >
            <i className="ri-delete-bin-line text-xs" />
          </button>
        )}
      </div>

      {/* Hover 效果 - 极细金色描边 */}
      {onClick && (
        <div 
          className="absolute inset-0 border-gold-matte opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ borderWidth: '0.5px' }}
        />
      )}
    </div>
  );
}
