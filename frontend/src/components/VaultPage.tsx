import { useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Grid2X2, Search, Sparkles, Sword } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { VaultCardShowcase } from './VaultCardShowcase';
import { CardCarousel } from './CardCarousel';
import { VaultItems, type VaultItem as RelicCard } from './VaultItems';
import { VAULT_OVERVIEW_VISIBLE, type VaultSideKey } from './GameShell';
import { normalizeCardType, resolveRarity, toNumber, type Rarity } from '../lib/gameLogic';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { mockHeroes, mockRelicCatalog, mockRelicInventory } from '../lib/mockContent';
import { getRelicCategory, getRelicIconSrc, getRelicKind, RELIC_COMBAT_STATUS } from '../lib/relics';
import type { EconomySnapshot, SavedHero } from '../types';

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
  onEquipRelic?: (heroId: string, relicId: string | null) => Promise<void> | void;
  demoMode?: boolean;
  activeTab?: VaultSideKey;
  onTabChange: (tab: VaultSideKey) => void;
  onOpenEnchant: () => void;
};

type DisplayHero = SavedHero & {
  placeholderArt?: string;
};


const demoHeroes = mockHeroes as DisplayHero[];
const CARD_PAGE_SIZE = 10;

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

function relicsFromEconomy(economy: EconomySnapshot | null, demoMode: boolean): RelicCard[] {
  const sourceRelics = demoMode && (!economy || economy.relics.length === 0) ? mockRelicInventory : economy?.relics ?? [];
  const sourceCatalog = demoMode && (!economy || economy.relic_catalog.length === 0) ? mockRelicCatalog : economy?.relic_catalog ?? [];
  const catalog = Object.fromEntries(sourceCatalog.map((item) => [item.relic_type, item]));
  return sourceRelics.map((entry) => {
    const definition = catalog[entry.relic_type];
    const tier = definition?.tier === 'legendary' || definition?.tier === 'limited' ? 'mythic' : (definition?.tier ?? 'common');
    return {
      id: entry.relic_type,
      name: definition?.display_name ?? entry.relic_type,
      rarity: tier as Rarity,
      family: definition?.family ?? 'Relic',
      kind: getRelicKind(definition ?? { relic_type: entry.relic_type }),
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
    <div className="flex flex-col gap-5 border-b border-white/8 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <h2 className="font-body text-xl font-light uppercase tracking-[0.18em] text-stone-100">{title}</h2>
        <div className="flex flex-wrap items-center gap-6">{filters}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-full min-w-0 items-center border border-white/10 bg-black/35 px-3">
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
  const rarity = resolveRarity(hero.character);
  const tone = rarityTone[rarity];
  const level = levelForHero(hero, index);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`portrait-card group relative w-full overflow-hidden border bg-[#090909] text-left transition duration-200 hover:-translate-y-0.5 hover:border-stone-500 ${
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
    <div className="grid grid-cols-[90px_minmax(0,1fr)] items-baseline gap-3 text-xs leading-5">
      <span className="text-stone-500">{label}</span>
      <span className="break-words text-stone-300">{value}</span>
    </div>
  );
}

function HeroDetailPanel({
  hero,
  index,
  relics,
  onEquipRelic,
}: {
  hero: DisplayHero | null;
  index: number;
  relics: RelicCard[];
  onEquipRelic?: (heroId: string, relicId: string | null) => Promise<void> | void;
}) {
  if (!hero) {
    return (
      <section className="h-full border border-white/8 bg-[#0a0a0a]/90 p-5">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Card Detail</div>
        <div className="mt-4 text-sm leading-6 text-stone-400">Select a card to inspect its combat profile, abilities, and traits.</div>
      </section>
    );
  }

  const rarity = resolveRarity(hero.character);
  const tone = rarityTone[rarity];
  const level = levelForHero(hero, index);
  const equipmentRelics = relics.filter((relic) => relic.kind === 'relic' && relic.amount > 0);
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

      <div className="mt-3 flex items-end justify-between border-b border-white/8 pb-3">
        <div className="text-base font-light tracking-[0.03em] text-stone-200">LV. {level} / 50</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">{formatNumber(heroBp(hero) + 60)} power</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <DetailStat label="HP" value={formatNumber(hero.character.state.HP)} />
        <DetailStat label="ATK" value={formatNumber(hero.character.state.ATK)} />
        <DetailStat label="DEF" value={formatNumber(hero.character.state.DEF)} />
        <DetailStat label="SPD" value={formatNumber(hero.character.state.SPEED)} />
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Abilities</div>
        <div className="mt-3 space-y-3">
          {skills.map((skill, indexKey) => (
            <AbilityRow key={`${skill.name}-${indexKey}`} skill={skill} />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Equip Relic</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-stone-600">
            {equippedRelic ? equippedRelic.name : 'None equipped'}
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-400">{RELIC_COMBAT_STATUS}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onEquipRelic?.(hero.id, null)}
            className={`border px-2 py-3 text-center transition ${
              !hero.equippedRelicId
                ? 'border-[#d7a852] bg-[#b49664]/10 text-[#f0d8ad]'
                : 'border-white/10 bg-black/35 text-stone-400 hover:border-stone-500'
            }`}
          >
            <div className="text-[9px] uppercase tracking-[0.14em]">None</div>
          </button>
          {equipmentRelics.slice(0, 8).map((relic) => {
            const active = hero.equippedRelicId === relic.id;
            return (
              <button
                key={relic.id}
                type="button"
                onClick={() => onEquipRelic?.(hero.id, relic.id)}
                className={`relative overflow-hidden border text-left transition ${
                  active ? 'border-[#d7a852]' : 'border-white/10 hover:border-stone-500'
                }`}
                title={relic.name}
              >
                {relic.icon ? (
                  <img src={relic.icon} alt={relic.name} className="h-12 w-full object-contain opacity-90" />
                ) : (
                  <div className="flex h-12 items-center justify-center bg-black/40">
                    <Sword size={16} className="text-stone-500" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5 text-center text-[8px] uppercase tracking-[0.12em] text-stone-300">
                  {active ? 'Equipped' : `x${relic.amount}`}
                </div>
              </button>
            );
          })}
        </div>
        {equipmentRelics.length === 0 && (
          <div className="mt-3 text-xs leading-5 text-stone-600">
            No equipment relics in inventory. Shards are used for enchanting in Forge.
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-white/8 pt-4">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Traits</div>
        <div className="mt-3 space-y-2">
          <Trait label="Battle Type" value={hero.character.state.TYPE || 'Unknown'} />
          <Trait label="Equipped Relic" value={equippedRelic?.name ?? 'None'} />
          <Trait label="Enchant" value={enchantRelic ?? 'Clean'} />
        </div>
      </div>
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
  onEquipRelic,
  demoMode,
  activeTab = 'card',
  onTabChange,
  onOpenEnchant,
}: VaultPageProps) {
  const [cardPage, setCardPage] = useState(1);
  const isCardDetail = activeTab === 'card';
  const cardsRef = useRef<HTMLElement | null>(null);

  const showCardsSection = activeTab === 'overview' || activeTab === 'card';
  const showItemSection = activeTab === 'overview' || activeTab === 'item';

  const displayHeroes = useMemo(() => (heroes.length > 0 ? heroes : demoMode ? demoHeroes : []) as DisplayHero[], [heroes, demoMode]);
  const relicCards = useMemo(() => relicsFromEconomy(economy, Boolean(demoMode)), [demoMode, economy]);

  const filteredHeroes = useMemo(() => (
    displayHeroes
      .filter((hero) => {
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return hero.character.name.toLowerCase().includes(needle) || hero.character.description.toLowerCase().includes(needle);
      })
      .filter((hero) => rarityFilter === 'all' || resolveRarity(hero.character) === rarityFilter)
      .sort((a, b) => {
        if (sort === 'bp') return heroBp(b) - heroBp(a);
        if (sort === 'name') return a.character.name.localeCompare(b.character.name);
        return b.createdAt - a.createdAt;
      })
  ), [displayHeroes, query, rarityFilter, sort]);

  const cardQueryKey = `${query}|${rarityFilter}|${sort}`;
  const [prevCardQueryKey, setPrevCardQueryKey] = useState(cardQueryKey);
  if (prevCardQueryKey !== cardQueryKey) {
    setPrevCardQueryKey(cardQueryKey);
    setCardPage(1);
  }

  const pagedHeroes = paginate(filteredHeroes, cardPage, CARD_PAGE_SIZE);

  const selectedHero =
    (isCardDetail ? filteredHeroes : pagedHeroes.items).find((hero) => hero.id === selectedHeroId) ||
    pagedHeroes.items[0] ||
    null;
  const selectedIndex = selectedHero ? displayHeroes.findIndex((hero) => hero.id === selectedHero.id) : 0;
  const showcaseIndex = selectedHero ? filteredHeroes.findIndex((hero) => hero.id === selectedHero.id) : 0;

  function stepCard(direction: number) {
    if (!filteredHeroes.length) return;
    const nextIndex = (showcaseIndex + direction + filteredHeroes.length) % filteredHeroes.length;
    onSelectHero(filteredHeroes[nextIndex].id);
    setCardPage(Math.floor(nextIndex / CARD_PAGE_SIZE) + 1);
  }

  function openCard(heroId: string) {
    onSelectHero(heroId);
    onTabChange('card');
    requestAnimationFrame(() => cardsRef.current?.scrollIntoView({ block: 'start' }));
  }

  const totalPower = displayHeroes.reduce((sum, hero) => sum + heroBp(hero), 0);

  return (
    <div className="mx-auto max-w-[1540px] px-3 py-6 sm:px-6 2xl:px-8">
      <PageHeader
        title="Vault"
        eyebrow="Archive"
        subtitle={activeTab === 'card' ? 'Card Collection' : activeTab === 'item' ? 'Item' : 'Collection Index'}
        description={
          activeTab === 'card'
            ? 'Inspect, admire, and equip your heroes.'
            : activeTab === 'item'
              ? 'Relic equipment and enchanting materials, in one inventory.'
              : 'Inspect cards, shards, and relics.'
        }
        stats={
          <>
            {[
              ['Cards Owned', `${displayHeroes.length} / 500`],
              ['Shards', relicCards.filter((relic) => relic.kind === 'shard').length],
              ['Relics', relicCards.filter((relic) => relic.kind === 'relic').length],
              ['Total Power', formatNumber(totalPower)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1">
                <span className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</span>
                <span className="text-sm text-stone-200">{value}</span>
              </div>
            ))}
          </>
        }
      />

      <div className="mt-5 space-y-5">
        {showCardsSection && (
          <section ref={cardsRef} className="min-w-0 scroll-mt-[94px] border border-white/8 bg-[#0a0a0a]/92">
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
                aria-label="Search cards"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search cards..."
                className="w-full bg-transparent text-sm text-stone-300 outline-none placeholder:text-stone-600"
              />
            </SectionHeader>

            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">
                {filteredHeroes.length} cards in archive{!isCardDetail && ' · Select a card to view & configure'}
              </div>
              <div className="flex flex-wrap items-center gap-3">
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
                {isCardDetail && VAULT_OVERVIEW_VISIBLE && (
                  <button type="button" onClick={() => onTabChange('overview')} className="flex h-9 items-center gap-2 border border-white/10 px-3 text-[10px] text-stone-300 transition hover:border-[#b49664]/50 hover:text-stone-100">
                    <Grid2X2 size={14} />Overview
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0 px-4 pb-6 sm:px-6">
              {pagedHeroes.items.length > 0 ? (
                <>
                  {isCardDetail && selectedHero ? (
                    <>
                      <div className="vault-card-layout">
                        <VaultCardShowcase key={selectedHero.id} hero={selectedHero} position={showcaseIndex} count={filteredHeroes.length} onPrevious={() => stepCard(-1)} onNext={() => stepCard(1)} />
                        <HeroDetailPanel hero={selectedHero} index={selectedIndex} relics={relicCards} onEquipRelic={onEquipRelic} />
                        <CardCarousel heroes={filteredHeroes} selectedHeroId={selectedHero.id} onSelectHero={(id) => {
                          onSelectHero(id);
                          setCardPage(Math.floor(filteredHeroes.findIndex((hero) => hero.id === id) / CARD_PAGE_SIZE) + 1);
                        }} />
                      </div>
                    </>
                  ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-4">
                    {pagedHeroes.items.map((hero, index) => (
                      <HeroTile
                        key={hero.id}
                        hero={hero}
                        index={index}
                        active={selectedHero?.id === hero.id}
                        onSelect={() => openCard(hero.id)}
                      />
                    ))}
                  </div>
                  )}
                  {!isCardDetail && <PageControl page={pagedHeroes.page} maxPage={pagedHeroes.maxPage} onChange={setCardPage} />}
                </>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center border border-dashed border-white/10 bg-black/25 text-center">
                  <BookOpen size={34} className="text-stone-600" />
                  <div className="mt-4 text-sm uppercase tracking-[0.22em] text-stone-400">{displayHeroes.length ? 'No matching cards' : 'No cards forged'}</div>
                  <div className="mt-2 max-w-sm text-sm leading-6 text-stone-500">{displayHeroes.length ? 'Try a different search or rarity to explore your collection.' : 'Forge your first hero to populate the vault with playable cards.'}</div>
                </div>
              )}
            </div>
          </section>

        )}

        {showItemSection && <VaultItems items={relicCards} onOpenCards={() => onTabChange('card')} onOpenEnchant={onOpenEnchant} />}
      </div>
    </div>
  );
}
