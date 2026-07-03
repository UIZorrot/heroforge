import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Grid2X2, ListFilter, Rows3, ScrollText, Search, Shield, Sparkles, Sword } from 'lucide-react';
import { PageHeader, PageHeaderStat } from './PageHeader';
import { calculateRarity, normalizeCardType, toNumber, type Rarity } from '../lib/gameLogic';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { mockHeroes, mockRelicCatalog, mockRelicInventory } from '../lib/mockContent';
import { getRelicCategory, getRelicIconSrc, type RelicCategory } from '../lib/relics';
import type { EconomySnapshot, RelicDefinition, SavedHero } from '../types';

type VaultSort = 'date' | 'bp' | 'name';

type VaultPageProps = {
  heroes: SavedHero[];
  economy: EconomySnapshot | null;
  selectedHeroId: string;
  onSelectHero: (heroId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  rarityFilter: Rarity | 'all';
  onRarityFilterChange: (rarity: Rarity | 'all') => void;
  sort: VaultSort;
  onSortChange: (sort: VaultSort) => void;
  demoMode?: boolean;
};

type DisplayHero = SavedHero & {
  placeholderArt?: string;
};

type RelicCard = {
  id: string;
  name: string;
  rarity: Rarity;
  family: string;
  amount: number;
  icon?: string | null;
  category: RelicCategory;
  definition?: RelicDefinition;
};

const demoHeroes = mockHeroes as DisplayHero[];
const CARD_PAGE_SIZE = 10;
const RELIC_PAGE_SIZE = 10;

const rarityTone: Record<Rarity, { text: string; border: string; glow: string; label: string; chip: string }> = {
  mythic: { text: 'text-[#d7a852]', border: 'border-[#b49664]/75', glow: 'shadow-[0_0_24px_rgba(180,150,100,0.22)]', label: 'MYTHIC', chip: 'bg-[#b49664]/12 text-[#d9b06b]' },
  epic: { text: 'text-violet-300', border: 'border-violet-400/40', glow: 'shadow-[0_0_24px_rgba(139,92,246,0.18)]', label: 'EPIC', chip: 'bg-violet-400/10 text-violet-300' },
  rare: { text: 'text-sky-300', border: 'border-sky-400/35', glow: 'shadow-[0_0_20px_rgba(56,189,248,0.12)]', label: 'RARE', chip: 'bg-sky-400/10 text-sky-300' },
  common: { text: 'text-stone-400', border: 'border-white/10', glow: '', label: 'COMMON', chip: 'bg-white/6 text-stone-400' },
};

function formatNumber(value: unknown) {
  const num = typeof value === 'number' ? value : toNumber(value, 0);
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(num || 0)));
}

function heroBp(hero: SavedHero) {
  return Math.max(0, toNumber(hero.character.BP, 0));
}

function typeLabel(hero: SavedHero) {
  return normalizeCardType(hero.character.state.TYPE).toUpperCase();
}

function levelForHero(hero: SavedHero, index = 0) {
  return Math.max(1, Math.min(50, Math.floor(heroBp(hero) / 450) + index + 1));
}

function artClass(hero: DisplayHero) {
  const key = hero.placeholderArt || hero.character.state.TYPE || '';
  const lower = key.toLowerCase();
  if (lower.includes('fire')) return 'from-[#542515] via-[#18110e] to-[#070707]';
  if (lower.includes('dark') || lower.includes('void')) return 'from-[#172033] via-[#0d1018] to-[#060606]';
  if (lower.includes('nature')) return 'from-[#173126] via-[#10140f] to-[#060606]';
  if (lower.includes('frost') || lower.includes('storm')) return 'from-[#182b3f] via-[#101317] to-[#060606]';
  if (lower.includes('light')) return 'from-[#463620] via-[#17130f] to-[#060606]';
  return 'from-[#2b241b] via-[#111111] to-[#060606]';
}

function relicsFromEconomy(economy: EconomySnapshot | null): RelicCard[] {
  const sourceRelics = !economy || economy.relics.length === 0 ? mockRelicInventory : economy.relics;
  const sourceCatalog = !economy || economy.relic_catalog.length === 0 ? mockRelicCatalog : economy.relic_catalog;
  const catalog = Object.fromEntries(sourceCatalog.map((item) => [item.relic_type, item]));
  return sourceRelics.map((entry) => {
    const definition = catalog[entry.relic_type];
    const tier = definition?.tier === 'legendary' || definition?.tier === 'limited' ? 'mythic' : (definition?.tier ?? 'common');
    return {
      id: entry.relic_type,
      name: definition?.display_name ?? entry.relic_type,
      rarity: tier as Rarity,
      family: definition?.family ?? 'Relic',
      amount: entry.amount,
      icon: getRelicIconSrc(definition),
      category: getRelicCategory(definition),
      definition,
    };
  });
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const maxPage = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, maxPage);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    maxPage,
    items: items.slice(start, start + pageSize),
  };
}

function SectionHeader({
  title,
  filters,
  searchPlaceholder,
  children,
}: {
  title: string;
  filters: React.ReactNode;
  searchPlaceholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-white/8 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <h2 className="font-body text-xl font-light uppercase tracking-[0.18em] text-stone-100">{title}</h2>
        <div className="flex flex-wrap items-center gap-6">{filters}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 min-w-[240px] items-center border border-white/10 bg-black/35 px-3">
          <Search size={15} className="mr-2 text-stone-600" />
          {children ?? (
            <input
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-stone-300 outline-none placeholder:text-stone-600"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PageControl({
  page,
  maxPage,
  onChange,
}: {
  page: number;
  maxPage: number;
  onChange: (next: number) => void;
}) {
  if (maxPage <= 1) return null;
  const visiblePages = Array.from({ length: Math.min(maxPage, 4) }, (_, index) => index + 1);
  return (
    <div className="mt-6 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.18em] text-stone-500">
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} className="flex h-8 w-8 items-center justify-center border border-white/10 hover:text-stone-200">
        <ChevronLeft size={14} />
      </button>
      {visiblePages.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`flex h-8 min-w-8 items-center justify-center border px-2 ${
            value === page ? 'border-[#b49664]/50 bg-[#b49664]/10 text-stone-100' : 'border-white/10 hover:text-stone-200'
          }`}
        >
          {value}
        </button>
      ))}
      {maxPage > visiblePages.length && <span className="px-1">...</span>}
      <button type="button" onClick={() => onChange(Math.min(maxPage, page + 1))} className="flex h-8 w-8 items-center justify-center border border-white/10 hover:text-stone-200">
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

function HeroTile({
  hero,
  index,
  active,
  onSelect,
}: {
  hero: DisplayHero;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const rarity = calculateRarity(heroBp(hero));
  const tone = rarityTone[rarity];
  const level = levelForHero(hero, index);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative h-[266px] overflow-hidden border bg-[#090909] text-left transition duration-200 hover:-translate-y-0.5 hover:border-stone-500 ${
        active ? `${tone.border} ${tone.glow}` : 'border-white/10'
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${artClass(hero)} opacity-95`} />
      <img
        src={hero.image || CARD_FALLBACK_SRC}
        alt={hero.character.name}
        className="absolute inset-0 h-full w-full object-cover object-top opacity-76"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.06)_22%,rgba(0,0,0,0.84)_75%,rgba(0,0,0,0.96)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.50)_0%,rgba(0,0,0,0.0)_100%)]" />
      <div className="absolute left-4 right-4 top-3 flex items-start justify-between gap-3">
        <div>
          <div className={`text-[9px] font-semibold uppercase tracking-[0.18em] ${tone.text}`}>{tone.label}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-stone-500">{typeLabel(hero)}</div>
        </div>
        <div className="text-sm font-light tracking-[0.05em] text-stone-100">{formatNumber(heroBp(hero))}</div>
      </div>
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[1.75rem] font-light leading-none tracking-[0.02em] text-stone-100">{hero.character.name}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">LV. {level}</div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Card</div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-[9px] text-stone-300">
          <span className="border border-white/8 bg-black/45 px-1.5 py-1">HP {formatNumber(hero.character.state.HP)}</span>
          <span className="border border-white/8 bg-black/45 px-1.5 py-1">ATK {formatNumber(hero.character.state.ATK)}</span>
          <span className="border border-white/8 bg-black/45 px-1.5 py-1">DEF {formatNumber(hero.character.state.DEF)}</span>
          <span className="border border-white/8 bg-black/45 px-1.5 py-1">SPD {formatNumber(hero.character.state.SPEED)}</span>
        </div>
        <div className="mt-3 truncate text-xs text-stone-300">{hero.character.skill.s1?.name || 'Unbound Skill'}</div>
      </div>
      {active && <div className="pointer-events-none absolute inset-0 border border-[#d7a852]" />}
    </button>
  );
}

function RelicTile({
  relic,
  active,
  onSelect,
}: {
  relic: RelicCard;
  active: boolean;
  onSelect: () => void;
}) {
  const tone = rarityTone[relic.rarity];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative h-[168px] overflow-hidden border bg-[#090909] text-left transition hover:-translate-y-0.5 hover:border-stone-500 ${
        active ? `${tone.border} ${tone.glow}` : 'border-white/10'
      }`}
    >
      {relic.icon ? (
        <img
          src={relic.icon}
          alt={relic.name}
          className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.92] brightness-[1.05] contrast-[1.08] saturate-[1.08] transition duration-200 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_34%,rgba(180,150,100,0.10),transparent_36%)]">
          <Sword size={26} className={tone.text} />
        </div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.14)_0%,rgba(0,0,0,0.02)_28%,rgba(0,0,0,0.46)_76%,rgba(0,0,0,0.70)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-14 bg-[linear-gradient(180deg,rgba(0,0,0,0.24)_0%,rgba(0,0,0,0.0)_100%)]" />

      <div className="relative flex h-full flex-col justify-between px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`text-[9px] font-semibold uppercase tracking-[0.18em] ${tone.text}`}>{tone.label}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500">x{relic.amount}</div>
        </div>

        <div className="min-w-0">
          <div className="truncate text-[1.05rem] font-light text-stone-100">{relic.name}</div>
          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-stone-400">
            <span>{relic.category}</span>
            <span className="text-stone-700">•</span>
            <span>{relic.family}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-white/8 pt-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-600">{label}</div>
      <div className="mt-2 text-sm text-stone-200">{value}</div>
    </div>
  );
}

function AbilityRow({ skill }: { skill: NonNullable<SavedHero['character']['skill']['s1']> }) {
  return (
    <div className="grid grid-cols-[42px_1fr] gap-3">
      <div className="flex h-10 w-10 items-center justify-center border border-[#b49664]/25 bg-[#b49664]/10">
        <Sparkles size={18} className="text-[#d7a852]" />
      </div>
      <div>
        <div className="text-sm text-stone-200">{skill.name || 'Ability'}</div>
        <div className="mt-1 text-xs leading-5 text-stone-500">{skill.description || 'No combat description recorded.'}</div>
      </div>
    </div>
  );
}

function Trait({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[34px_1fr] gap-3">
      <div className="flex h-8 w-8 items-center justify-center border border-white/8 bg-white/[0.03]">
        <Shield size={15} className="text-stone-500" />
      </div>
      <div>
        <div className="text-sm text-stone-300">{label}</div>
        <div className="mt-0.5 text-xs text-stone-600">{value}</div>
      </div>
    </div>
  );
}

function HeroDetailPanel({ hero, index, relics }: { hero: DisplayHero | null; index: number; relics: RelicCard[] }) {
  if (!hero) {
    return (
      <section className="h-full border border-white/8 bg-[#0a0a0a]/90 p-5">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Card Detail</div>
        <div className="mt-4 text-sm leading-6 text-stone-400">Select a card to inspect its combat profile, abilities, and traits.</div>
      </section>
    );
  }

  const rarity = calculateRarity(heroBp(hero));
  const tone = rarityTone[rarity];
  const level = levelForHero(hero, index);
  const equippedRelic = relics.find((relic) => relic.id === hero.equippedRelicId);
  const enchantRelic = hero.enchantment?.relicName || relics.find((relic) => relic.id === hero.enchantment?.relicId)?.name;
  const skills = [hero.character.skill.s1, hero.character.skill.s2].filter(Boolean) as Array<NonNullable<SavedHero['character']['skill']['s1']>>;

  return (
    <section className="h-full border border-white/8 bg-[#0a0a0a]/90 p-5">
      <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-5">
        <div>
          <h3 className="text-4xl font-light tracking-[0.02em] text-stone-100">{hero.character.name}</h3>
          <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em]">
            <span className={tone.text}>{tone.label}</span>
            <span className="text-stone-500">{typeLabel(hero)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Power</div>
          <div className="mt-2 text-lg font-light text-stone-100">{formatNumber(heroBp(hero))}</div>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between border-b border-white/8 pb-5">
        <div className="text-3xl font-light tracking-[0.03em] text-stone-200">LV. {level} / 50</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">{formatNumber(heroBp(hero) + 60)} power</div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5">
        <DetailStat label="HP" value={formatNumber(hero.character.state.HP)} />
        <DetailStat label="ATK" value={formatNumber(hero.character.state.ATK)} />
        <DetailStat label="DEF" value={formatNumber(hero.character.state.DEF)} />
        <DetailStat label="SPD" value={formatNumber(hero.character.state.SPEED)} />
      </div>

      <div className="mt-7">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Abilities</div>
        <div className="mt-4 space-y-4">
          {skills.map((skill, indexKey) => (
            <AbilityRow key={`${skill.name}-${indexKey}`} skill={skill} />
          ))}
        </div>
      </div>

      <div className="mt-7">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Traits</div>
        <div className="mt-4 space-y-3">
          <Trait label="Battle Type" value={hero.character.state.TYPE || 'Unknown'} />
          <Trait label="Equipped Relic" value={equippedRelic?.name ?? 'None'} />
          <Trait label="Enchant" value={enchantRelic ?? 'Clean'} />
        </div>
      </div>

      <button type="button" className="mt-7 w-full bg-[#806838] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-100 transition hover:bg-[#9a7d4a]">
        View Details
      </button>
    </section>
  );
}

function RelicDetailPanel({ relic }: { relic: RelicCard | null }) {
  if (!relic) {
    return (
      <section className="h-full border border-white/8 bg-[#0a0a0a]/90 p-5">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Relic Detail</div>
        <div className="mt-4 text-sm leading-6 text-stone-400">Select a relic to inspect its lore, category, and effect profile.</div>
      </section>
    );
  }

  const tone = rarityTone[relic.rarity];
  return (
    <section className="h-full border border-white/8 bg-[#0a0a0a]/90 p-5">
      <div className="flex items-start gap-4 border-b border-white/8 pb-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.03]">
          {relic.icon ? <img src={relic.icon} alt={relic.name} className="h-12 w-12 object-contain" /> : <ScrollText size={20} className={tone.text} />}
        </div>
        <div className="min-w-0">
          <h3 className="text-3xl font-light tracking-[0.02em] text-stone-100">{relic.name}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
            <span className={`${tone.chip} px-2 py-1`}>{tone.label}</span>
            <span className="text-stone-500">{relic.category}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 text-2xl font-light text-stone-100">+{formatNumber(relic.amount * 125)} power</div>

      <div className="mt-6 space-y-4">
        <DetailStat label="Family" value={relic.family} />
        <DetailStat label="Forge Bias" value={relic.definition?.forge_bias ?? 'Unknown'} />
        <DetailStat label="Battle Bias" value={relic.definition?.battle_bias ?? 'Unknown'} />
        <DetailStat label="Effect" value={relic.definition?.effect_profile ?? 'No effect profile recorded.'} />
        <DetailStat label="Lore" value={relic.definition?.lore_summary ?? 'No lore recorded.'} />
      </div>

      <button type="button" className="mt-7 w-full bg-[#806838] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-100 transition hover:bg-[#9a7d4a]">
        View Details
      </button>
    </section>
  );
}

export function VaultPage({
  heroes,
  economy,
  selectedHeroId,
  onSelectHero,
  query,
  onQueryChange,
  rarityFilter,
  onRarityFilterChange,
  sort,
  onSortChange,
  demoMode,
}: VaultPageProps) {
  const [relicQuery, setRelicQuery] = useState('');
  const [relicFilter, setRelicFilter] = useState<RelicCategory | 'all'>('all');
  const [cardPage, setCardPage] = useState(1);
  const [relicPage, setRelicPage] = useState(1);
  const [selectedRelicId, setSelectedRelicId] = useState('');
  const cardsRef = useRef<HTMLElement | null>(null);
  const relicsRef = useRef<HTMLElement | null>(null);

  const displayHeroes = (heroes.length > 0 ? heroes : demoMode ? demoHeroes : []) as DisplayHero[];
  const relicCards = useMemo(() => relicsFromEconomy(economy), [economy]);

  const filteredHeroes = useMemo(() => (
    displayHeroes
      .filter((hero) => {
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return hero.character.name.toLowerCase().includes(needle) || hero.character.description.toLowerCase().includes(needle);
      })
      .filter((hero) => rarityFilter === 'all' || calculateRarity(heroBp(hero)) === rarityFilter)
      .sort((a, b) => {
        if (sort === 'bp') return heroBp(b) - heroBp(a);
        if (sort === 'name') return a.character.name.localeCompare(b.character.name);
        return b.createdAt - a.createdAt;
      })
  ), [displayHeroes, query, rarityFilter, sort]);

  const filteredRelics = useMemo(() => (
    relicCards
      .filter((relic) => {
        const needle = relicQuery.trim().toLowerCase();
        if (!needle) return true;
        return (
          relic.name.toLowerCase().includes(needle) ||
          relic.family.toLowerCase().includes(needle) ||
          relic.category.toLowerCase().includes(needle)
        );
      })
      .filter((relic) => relicFilter === 'all' || relic.category === relicFilter)
  ), [relicCards, relicFilter, relicQuery]);

  useEffect(() => {
    setCardPage(1);
  }, [query, rarityFilter, sort]);

  useEffect(() => {
    setRelicPage(1);
  }, [relicFilter, relicQuery]);

  const pagedHeroes = paginate(filteredHeroes, cardPage, CARD_PAGE_SIZE);
  const pagedRelics = paginate(filteredRelics, relicPage, RELIC_PAGE_SIZE);

  const selectedHero =
    displayHeroes.find((hero) => hero.id === selectedHeroId) ||
    pagedHeroes.items[0] ||
    displayHeroes[0] ||
    null;
  const selectedIndex = selectedHero ? displayHeroes.findIndex((hero) => hero.id === selectedHero.id) : 0;

  const selectedRelic =
    filteredRelics.find((relic) => relic.id === selectedRelicId) ||
    pagedRelics.items[0] ||
    filteredRelics[0] ||
    relicCards[0] ||
    null;

  const totalPower = displayHeroes.reduce((sum, hero) => sum + heroBp(hero), 0);
  const strongest = displayHeroes.length > 0 ? Math.max(...displayHeroes.map(heroBp)) : 0;

  return (
    <div className="mx-auto max-w-[1540px] px-6 py-6 2xl:px-8">
      <PageHeader
        title="Vault"
        eyebrow="Archive"
        subtitle="Collection Index"
        description="Inspect cards and relics."
        stats={
          <>
            <PageHeaderStat label="Cards Owned" value={`${displayHeroes.length} / 500`} />
            <PageHeaderStat label="Relics Owned" value={`${relicCards.length} / 100`} />
            <PageHeaderStat label="Total Power" value={formatNumber(totalPower)} />
            <PageHeaderStat label="Strongest Card" value={formatNumber(strongest)} />
          </>
        }
      />

      <div className="mt-5 space-y-5">
        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section ref={cardsRef} className="flex h-full flex-col border border-white/8 bg-[#0a0a0a]/92">
            <SectionHeader
              title="Cards"
              searchPlaceholder="Search cards..."
              filters={(['all', 'mythic', 'epic', 'rare', 'common'] as Array<Rarity | 'all'>).map((rarity) => (
                <button
                  key={rarity}
                  type="button"
                  onClick={() => onRarityFilterChange(rarity)}
                  className={`relative pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
                    rarityFilter === rarity ? 'text-stone-100' : 'text-stone-600 hover:text-stone-300'
                  }`}
                >
                  {rarity}
                  {rarityFilter === rarity && <span className="absolute inset-x-0 bottom-0 h-px bg-[#b49664]" />}
                </button>
              ))}
            >
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search cards..."
                className="w-full bg-transparent text-sm text-stone-300 outline-none placeholder:text-stone-600"
              />
            </SectionHeader>

            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">
                {filteredHeroes.length} cards in archive
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="flex h-9 w-9 items-center justify-center border border-white/10 bg-black/35 text-stone-500 hover:text-stone-200">
                  <ListFilter size={15} />
                </button>
                <label className="flex h-9 items-center border border-white/10 bg-black/35 px-3 text-[10px] uppercase tracking-[0.18em] text-stone-600">
                  Sort by
                  <select
                    value={sort}
                    onChange={(event) => onSortChange(event.target.value as VaultSort)}
                    className="ml-3 bg-transparent text-[10px] uppercase tracking-[0.18em] text-stone-300 outline-none"
                  >
                    <option value="date">Latest</option>
                    <option value="bp">Power</option>
                    <option value="name">Name</option>
                  </select>
                </label>
                <button type="button" className="flex h-9 w-9 items-center justify-center border border-white/10 bg-black/35 text-stone-500 hover:text-stone-200">
                  <Grid2X2 size={15} />
                </button>
                <button type="button" className="flex h-9 w-9 items-center justify-center border border-[#b49664]/30 bg-[#b49664]/10 text-stone-200">
                  <Rows3 size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 px-6 pb-6">
              {pagedHeroes.items.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
                    {pagedHeroes.items.map((hero, index) => (
                      <HeroTile
                        key={hero.id}
                        hero={hero}
                        index={index}
                        active={selectedHero?.id === hero.id}
                        onSelect={() => onSelectHero(hero.id)}
                      />
                    ))}
                  </div>
                  <PageControl page={pagedHeroes.page} maxPage={pagedHeroes.maxPage} onChange={setCardPage} />
                </>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center border border-dashed border-white/10 bg-black/25 text-center">
                  <BookOpen size={34} className="text-stone-600" />
                  <div className="mt-4 text-sm uppercase tracking-[0.22em] text-stone-400">No cards forged</div>
                  <div className="mt-2 max-w-sm text-sm leading-6 text-stone-600">Forge your first hero to populate the vault with playable cards.</div>
                </div>
              )}
            </div>
          </section>

          <HeroDetailPanel hero={selectedHero} index={selectedIndex} relics={relicCards} />
        </div>

        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section ref={relicsRef} className="flex h-full flex-col border border-white/8 bg-[#0a0a0a]/92">
            <SectionHeader
              title="Relics"
              searchPlaceholder="Search relics..."
              filters={(['all', 'weapon', 'armor', 'accessory', 'artifact'] as Array<RelicCategory | 'all'>).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRelicFilter(item)}
                  className={`relative pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
                    relicFilter === item ? 'text-stone-100' : 'text-stone-600 hover:text-stone-300'
                  }`}
                >
                  {item}
                  {relicFilter === item && <span className="absolute inset-x-0 bottom-0 h-px bg-[#b49664]" />}
                </button>
              ))}
            >
              <input
                value={relicQuery}
                onChange={(event) => setRelicQuery(event.target.value)}
                placeholder="Search relics..."
                className="w-full bg-transparent text-sm text-stone-300 outline-none placeholder:text-stone-600"
              />
            </SectionHeader>

            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">
                {filteredRelics.length} relics in archive
              </div>
              <div className="flex items-center gap-3">
                <button type="button" className="flex h-9 w-9 items-center justify-center border border-white/10 bg-black/35 text-stone-500 hover:text-stone-200">
                  <ListFilter size={15} />
                </button>
                <button type="button" className="flex h-9 w-9 items-center justify-center border border-white/10 bg-black/35 text-stone-500 hover:text-stone-200">
                  <Grid2X2 size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 px-6 pb-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
                {pagedRelics.items.map((relic) => (
                  <RelicTile key={relic.id} relic={relic} active={selectedRelic?.id === relic.id} onSelect={() => setSelectedRelicId(relic.id)} />
                ))}
              </div>
              <PageControl page={pagedRelics.page} maxPage={pagedRelics.maxPage} onChange={setRelicPage} />
            </div>
          </section>
          <RelicDetailPanel relic={selectedRelic} />
        </div>
      </div>
    </div>
  );
}
