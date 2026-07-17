import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Clock3, Crown, Gem, Search, Shield, ShoppingBag, Sparkles, Swords, WalletCards } from 'lucide-react';
import { buyMarketRelic, fetchMarketBoard, sellMarketRelic } from '../lib/api';
import { PageHeader, PageHeaderStat } from './PageHeader';
import { calculateRarity, normalizeCardType, toNumber, type Rarity } from '../lib/gameLogic';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { mockHeroes, mockRelicCatalog } from '../lib/mockContent';
import { getRelicCategory, getRelicIconSrc, type RelicCategory } from '../lib/relics';
import type { EconomySnapshot, MarketBoardSnapshot, MarketBrokerOffer, MarketRelicListing, SavedHero } from '../types';

type MarketPageProps = {
  heroes: SavedHero[];
  economy: EconomySnapshot | null;
  token?: string | null;
  demoMode?: boolean;
  onEconomyChange?: (economy: EconomySnapshot) => void;
};

const rarityTone: Record<Rarity, { text: string; border: string; chip: string; glow: string }> = {
  mythic: { text: 'text-[#d7a852]', border: 'border-[#b49664]/70', chip: 'bg-[#b49664]/10 text-[#f0d8ad]', glow: 'shadow-[0_0_26px_rgba(180,150,100,0.18)]' },
  epic: { text: 'text-violet-300', border: 'border-violet-400/35', chip: 'bg-violet-400/10 text-violet-200', glow: 'shadow-[0_0_24px_rgba(139,92,246,0.14)]' },
  rare: { text: 'text-sky-300', border: 'border-sky-400/35', chip: 'bg-sky-400/10 text-sky-200', glow: 'shadow-[0_0_24px_rgba(56,189,248,0.14)]' },
  common: { text: 'text-stone-400', border: 'border-white/10', chip: 'bg-white/6 text-stone-400', glow: '' },
};

const tierBasePrice: Record<MarketRelicListing['tier'], number> = {
  common: 140,
  rare: 680,
  epic: 1680,
  legendary: 3200,
  limited: 4200,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value || 0)));
}

function buildDemoRelicListing(
  relic: EconomySnapshot['relic_catalog'][number],
  index: number,
  ownedAmount: number
): MarketRelicListing {
  const tierPrice = tierBasePrice[relic.tier] ?? tierBasePrice.common;
  const demandScalar = relic.is_limited ? 1.55 : relic.tier === 'epic' ? 1.24 : relic.tier === 'rare' ? 1.08 : 1;
  const askPrice = Math.round(tierPrice * demandScalar + index * 17);
  const spread = Math.max(18, Math.round(askPrice * (relic.is_limited ? 0.16 : relic.tier === 'epic' ? 0.12 : 0.11)));
  const bidPrice = Math.max(1, askPrice - spread);

  let marketDepth = 12 + (index % 5);
  let trend: MarketRelicListing['trend'] = index % 3 === 0 ? 'soft' : 'firm';
  let settlement = 'Instant settlement';

  if (relic.is_limited) {
    marketDepth = 1;
    trend = 'hot';
    settlement = 'Escrow window 12h';
  } else if (relic.tier === 'legendary') {
    marketDepth = 2;
    trend = 'firm';
    settlement = 'Broker release 4h';
  } else if (relic.tier === 'epic') {
    marketDepth = 4 + (index % 2);
    trend = 'firm';
    settlement = 'Broker release 4h';
  } else if (relic.tier === 'rare') {
    marketDepth = 8 + (index % 3);
  }

  return {
    relic_type: relic.relic_type,
    display_name: relic.display_name,
    family: relic.family,
    tier: relic.tier,
    rarity: relic.tier === 'limited' || relic.tier === 'legendary' ? 'mythic' : relic.tier,
    category: getRelicCategory(relic),
    icon_path: getRelicIconSrc(relic),
    lore_summary: relic.lore_summary,
    effect_profile: relic.effect_profile,
    forge_bias: relic.forge_bias,
    battle_bias: relic.battle_bias,
    is_limited: relic.is_limited,
    ask_price: askPrice,
    bid_price: bidPrice,
    spread,
    market_depth: marketDepth,
    owned_amount: Math.max(0, ownedAmount),
    trend,
    settlement,
  };
}

function buildDemoBrokerOffer(hero: SavedHero, index: number): MarketBrokerOffer {
  const bp = Math.max(0, toNumber(hero.character.BP, 0));
  const rarity = calculateRarity(bp);
  const askPrice = Math.round(bp * (rarity === 'mythic' ? 0.61 : rarity === 'epic' ? 0.54 : 0.46) + 220 + index * 35);

  return {
    id: hero.id,
    name: hero.character.name,
    image_url: hero.image || CARD_FALLBACK_SRC,
    rarity,
    ask_price: askPrice,
    bp,
    type_label: normalizeCardType(hero.character.state.TYPE).toUpperCase(),
    title: hero.character.state.TYPE,
    primary_skill: hero.character.skill.s1?.name || 'Unbound Skill',
    secondary_skill: hero.character.skill.s2?.name || 'Unbound Skill',
  };
}

function buildDemoMarketBoard(heroes: SavedHero[], economy: EconomySnapshot | null): MarketBoardSnapshot {
  const sourceHeroes = heroes.length > 0 ? heroes : mockHeroes;
  const sourceCatalog = economy?.relic_catalog?.length ? economy.relic_catalog : mockRelicCatalog;
  const ownedAmounts = new Map((economy?.relics ?? []).map((entry) => [entry.relic_type, entry.amount]));
  const relicListings = sourceCatalog
    .map((relic, index) => buildDemoRelicListing(relic, index, ownedAmounts.get(relic.relic_type) ?? 0))
    .sort((a, b) => b.ask_price - a.ask_price);
  const featuredRelics = relicListings.filter((listing) => listing.is_limited || listing.rarity === 'mythic').slice(0, 3);
  const brokerOffers = [...sourceHeroes]
    .sort((a, b) => toNumber(b.character.BP, 0) - toNumber(a.character.BP, 0))
    .slice(0, 5)
    .map(buildDemoBrokerOffer);
  const marketTransactions = (economy?.transactions ?? [])
    .filter((entry) => entry.reason === 'market_buy_relic' || entry.reason === 'market_sell_relic')
    .slice(0, 6);
  const orderTape =
    marketTransactions.length > 0
      ? marketTransactions.map((entry) => {
          const meta = (entry.metadata ?? {}) as Record<string, unknown>;
          const quantityLabel = Number(meta.quantity ?? 0) || Math.abs(entry.delta || 0);
          return {
            id: entry.id,
            label: String(meta.relic_type ?? entry.resource_key ?? 'Relic'),
            action: entry.reason === 'market_buy_relic' ? 'Bought from market' : 'Sold to market',
            note: `${formatNumber(quantityLabel)} unit / dust ${formatNumber(Math.abs(Number(meta.total_price ?? 0) || 0))}`,
          };
        })
      : relicListings.slice(0, 6).map((listing, index) => ({
          id: listing.relic_type,
          label: `${listing.display_name} / ${listing.family}`,
          action: index % 2 === 0 ? 'Bid stack forming' : 'Offer stack refreshed',
          note: index % 2 === 0 ? `Buy wall ${formatNumber(listing.bid_price)}` : `Ask ${formatNumber(listing.ask_price)} / depth ${listing.market_depth}`,
        }));

  return {
    generated_at: new Date().toISOString(),
    relic_listings: relicListings,
    featured_relics: featuredRelics,
    broker_offers: brokerOffers,
    order_tape: orderTape,
    notes: [
      'Relic exchange settles directly against your internal dust balance.',
      'Card brokerage stays read-only until ownership transfer and listing rules are formalized.',
      'Equipped relic references are cosmetic right now, so only actual relic inventory counts can be traded.',
    ],
  };
}

function listingMatches(listing: MarketRelicListing, query: string, filter: RelicCategory | 'all') {
  const text = `${listing.display_name} ${listing.family} ${listing.effect_profile} ${listing.category}`.toLowerCase();
  return (!query || text.includes(query)) && (filter === 'all' || listing.category === filter);
}

function sectionButton(active: boolean) {
  return active
    ? 'border-[#b49664]/55 bg-[#b49664]/10 text-stone-100'
    : 'border-white/10 bg-black/30 text-stone-500 hover:border-white/18 hover:text-stone-300';
}

function ListingTile({
  listing,
  active,
  onSelect,
}: {
  listing: MarketRelicListing;
  active: boolean;
  onSelect: () => void;
}) {
  const tone = rarityTone[listing.rarity];
  const trendTone =
    listing.trend === 'hot'
      ? 'text-[#f0d8ad]'
      : listing.trend === 'firm'
        ? 'text-sky-200'
        : 'text-stone-400';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative overflow-hidden border bg-[#080808] p-4 text-left transition hover:-translate-y-0.5 ${active ? `${tone.border} ${tone.glow}` : 'border-white/10 hover:border-stone-500'}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_14%,rgba(180,150,100,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%,rgba(0,0,0,0.24))]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_50%_32%,rgba(180,150,100,0.18),rgba(0,0,0,0.92)_74%)]">
              {listing.icon_path ? (
                <img src={listing.icon_path} alt={listing.display_name} className="absolute inset-0 h-full w-full object-cover object-center" />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.22em] text-stone-500">{listing.family}</div>
              )}
              {listing.is_limited && <div className="absolute left-2 top-2 border border-[#b49664]/40 bg-black/65 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.18em] text-[#f0d8ad]">Limited</div>}
            </div>
            <div className="min-w-0">
              <div className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${tone.text}`}>{listing.family}</div>
              <h3 className="mt-1 truncate font-body text-lg font-light uppercase tracking-[0.12em] text-stone-100">{listing.display_name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-stone-500">
                <span className={`border px-2 py-1 ${tone.chip}`}>{listing.tier}</span>
                <span>{listing.category}</span>
                <span className={trendTone}>{listing.trend}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.18em] text-stone-500">Ask</div>
            <div className="mt-1 text-2xl font-light leading-none tracking-[0.04em] text-stone-100">{formatNumber(listing.ask_price)}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">Bid {formatNumber(listing.bid_price)}</div>
          </div>
        </div>

        <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-400">{listing.lore_summary}</p>
        <div className="mt-3 text-[11px] leading-5 text-stone-500">{listing.effect_profile}</div>

        <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-4 text-[10px] uppercase tracking-[0.18em] text-stone-500">
          <span>Depth {formatNumber(listing.market_depth)}</span>
          <span>Owned {formatNumber(listing.owned_amount)}</span>
        </div>
      </div>
    </button>
  );
}

function HeroOfferRow({ offer }: { offer: MarketBrokerOffer }) {
  const tone = rarityTone[offer.rarity];
  return (
    <article className={`grid gap-4 border bg-[#090909] p-4 md:grid-cols-[96px_minmax(0,1fr)_140px] ${tone.border}`}>
      <div className="relative h-28 overflow-hidden border border-white/10 bg-black">
        <img src={offer.image_url || CARD_FALLBACK_SRC} alt={offer.name} className="absolute inset-0 h-full w-full object-cover object-top opacity-85" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.16)_34%,rgba(0,0,0,0.88)_100%)]" />
        <div className="absolute inset-x-2 bottom-2 text-[9px] uppercase tracking-[0.18em] text-stone-300">{offer.type_label}</div>
      </div>
      <div className="min-w-0">
        <div className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${tone.text}`}>{offer.rarity}</div>
        <h3 className="mt-1 font-body text-lg font-light uppercase tracking-[0.12em] text-stone-100">{offer.name}</h3>
        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-stone-500">{offer.title}</div>
        <div className="mt-3 grid gap-2 text-sm text-stone-400">
          <div>{offer.primary_skill}</div>
          <div className="text-stone-600">{offer.secondary_skill}</div>
        </div>
      </div>
      <div className="flex flex-col justify-between border-l border-white/8 pl-4">
        <div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-stone-500">Ask</div>
          <div className="mt-1 text-2xl font-light leading-none tracking-[0.04em] text-stone-100">{formatNumber(offer.ask_price)}</div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">BP {formatNumber(offer.bp)}</div>
        </div>
        <button type="button" className="mt-4 inline-flex items-center justify-center gap-2 border border-white/10 bg-black/40 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-300 transition hover:border-[#b49664]/45 hover:text-[#f0d8ad]">
          Review
          <ArrowUpRight size={13} />
        </button>
      </div>
    </article>
  );
}

export function MarketPage({ heroes, economy, token, demoMode = false, onEconomyChange }: MarketPageProps) {
  const [board, setBoard] = useState<MarketBoardSnapshot | null>(demoMode ? buildDemoMarketBoard(heroes, economy) : null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(!demoMode);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RelicCategory | 'all'>('all');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busySide, setBusySide] = useState<'buy' | 'sell' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  async function loadLiveBoard(currentToken: string) {
    setLoadingBoard(true);
    setBoardError(null);
    try {
      const snapshot = await fetchMarketBoard(currentToken);
      setBoard(snapshot);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : 'Failed to load market board');
    } finally {
      setLoadingBoard(false);
    }
  }

  useEffect(() => {
    if (demoMode) {
      setBoard(buildDemoMarketBoard(heroes, economy));
      setBoardError(null);
      setLoadingBoard(false);
    }
  }, [demoMode, economy, heroes]);

  useEffect(() => {
    if (demoMode) return;
    if (!token) {
      setBoard(null);
      setBoardError('Market board requires a live player session.');
      setLoadingBoard(false);
      return;
    }
    void loadLiveBoard(token);
  }, [demoMode, token]);

  const relicListings = board?.relic_listings ?? [];
  const filteredListings = useMemo(
    () => relicListings.filter((listing) => listingMatches(listing, normalizedQuery, category)),
    [category, normalizedQuery, relicListings]
  );
  const featuredListings = board?.featured_relics ?? [];
  const brokerOffers = board?.broker_offers ?? [];
  const orderFeed = board?.order_tape ?? [];
  const marketNotes = board?.notes ?? [];

  useEffect(() => {
    if (!filteredListings.length) {
      setSelectedListingId('');
      return;
    }
    if (!filteredListings.some((listing) => listing.relic_type === selectedListingId)) {
      setSelectedListingId(filteredListings[0]?.relic_type ?? '');
    }
  }, [filteredListings, selectedListingId]);

  const walletDust = demoMode ? 8650 : economy?.wallet?.dust_balance ?? economy?.starter.dust_balance ?? 0;
  const sortedByAsk = [...relicListings].sort((a, b) => a.ask_price - b.ask_price);
  const medianAsk = sortedByAsk.length > 0 ? sortedByAsk[Math.floor(sortedByAsk.length / 2)]?.ask_price ?? 0 : 0;
  const selectedListing = filteredListings.find((listing) => listing.relic_type === selectedListingId) ?? filteredListings[0] ?? relicListings[0] ?? null;
  const safeQuantity = Math.max(1, Math.min(99, Math.floor(quantity || 1)));
  const buyTotal = selectedListing ? selectedListing.ask_price * safeQuantity : 0;
  const sellTotal = selectedListing ? selectedListing.bid_price * safeQuantity : 0;

  async function refreshBoardAfterTrade() {
    if (!demoMode && token) {
      await loadLiveBoard(token);
    }
  }

  async function handleTrade(side: 'buy' | 'sell') {
    if (!selectedListing) return;
    if (!token || demoMode) {
      setError('Market trading requires a live player session.');
      return;
    }
    setBusySide(side);
    setError(null);
    setMessage(null);
    try {
      const result =
        side === 'buy'
          ? await buyMarketRelic(selectedListing.relic_type, safeQuantity, token)
          : await sellMarketRelic(selectedListing.relic_type, safeQuantity, token);
      onEconomyChange?.(result.economy);
      await refreshBoardAfterTrade();
      setMessage(
        side === 'buy'
          ? `Purchased ${safeQuantity} ${selectedListing.display_name} for ${formatNumber(result.trade.totalPrice)} dust.`
          : `Sold ${safeQuantity} ${selectedListing.display_name} for ${formatNumber(result.trade.totalPrice)} dust.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Market order failed');
    } finally {
      setBusySide(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1540px] px-6 py-6 2xl:px-8">
      <PageHeader
        title="Market"
        eyebrow="Exchange"
        subtitle="Relic & Broker Board"
        description="The board is now sourced from the backend. Frontend filtering stays local, but pricing, depth, featured windows, broker offers, and tape are all server-authored."
        stats={
          <>
            <PageHeaderStat label="Active Listings" value={filteredListings.length} />
            <PageHeaderStat label="Limited Windows" value={featuredListings.length} />
            <PageHeaderStat label="Median Ask" value={formatNumber(medianAsk)} />
            <PageHeaderStat label="Dust Reserve" value={formatNumber(walletDust)} />
          </>
        }
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="border border-white/8 bg-[#0a0a0a]/92">
          <div className="flex flex-col gap-5 border-b border-white/8 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Exchange Board</div>
                <h2 className="mt-2 font-body text-xl font-light uppercase tracking-[0.18em] text-stone-100">Relic Listings</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'weapon', 'armor', 'accessory', 'artifact'] as Array<RelicCategory | 'all'>).map((item) => (
                  <button key={item} type="button" onClick={() => setCategory(item)} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${sectionButton(category === item)}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex h-10 min-w-[260px] items-center border border-white/10 bg-black/35 px-3">
              <Search size={15} className="mr-2 text-stone-600" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search relic, family, or effect..."
                className="w-full bg-transparent text-sm text-stone-300 outline-none placeholder:text-stone-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-[10px] uppercase tracking-[0.18em] text-stone-600">
            <span>{filteredListings.length} listings visible</span>
            <span>{demoMode ? 'Demo market is read-only.' : 'System market settles directly in dust.'}</span>
          </div>

          {boardError && !board && (
            <div className="px-6 pb-4">
              <div className="border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm text-red-100">{boardError}</div>
            </div>
          )}

          <div className="px-6 pb-6">
            {loadingBoard && !board ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center border border-dashed border-white/10 bg-black/25 text-center">
                <ShoppingBag size={32} className="text-stone-600" />
                <div className="mt-4 text-sm uppercase tracking-[0.22em] text-stone-400">Loading market board</div>
                <div className="mt-2 max-w-sm text-sm leading-6 text-stone-600">Fetching authoritative listings, price bands, and tape from the server.</div>
              </div>
            ) : filteredListings.length > 0 ? (
              <div className="grid gap-4 2xl:grid-cols-2">
                {filteredListings.map((listing) => (
                  <ListingTile key={listing.relic_type} listing={listing} active={selectedListing?.relic_type === listing.relic_type} onSelect={() => setSelectedListingId(listing.relic_type)} />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[260px] flex-col items-center justify-center border border-dashed border-white/10 bg-black/25 text-center">
                <ShoppingBag size={32} className="text-stone-600" />
                <div className="mt-4 text-sm uppercase tracking-[0.22em] text-stone-400">No matching listings</div>
                <div className="mt-2 max-w-sm text-sm leading-6 text-stone-600">Adjust your search terms or switch the item category filter.</div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Trade Desk</div>
                <h3 className="mt-2 font-body text-xl font-light uppercase tracking-[0.16em] text-stone-100">
                  {selectedListing?.display_name ?? 'No Listing'}
                </h3>
              </div>
              <Gem size={18} className="text-[#d7a852]" />
            </div>

            {selectedListing ? (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3 text-[10px] uppercase tracking-[0.18em]">
                  <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                    <div>Ask</div>
                    <div className="mt-2 text-stone-100">{formatNumber(selectedListing.ask_price)}</div>
                  </div>
                  <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                    <div>Bid</div>
                    <div className="mt-2 text-stone-100">{formatNumber(selectedListing.bid_price)}</div>
                  </div>
                  <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                    <div>Owned</div>
                    <div className="mt-2 text-stone-100">{formatNumber(selectedListing.owned_amount)}</div>
                  </div>
                  <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                    <div>Depth</div>
                    <div className="mt-2 text-stone-100">{formatNumber(selectedListing.market_depth)}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={safeQuantity}
                    onChange={(event) => setQuantity(Number(event.target.value))}
                    className="mt-2 h-10 w-full border border-white/10 bg-black/35 px-3 text-sm text-stone-100 outline-none"
                  />
                </div>

                <div className="mt-4 space-y-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">
                  <div className="flex items-center justify-between">
                    <span>Buy total</span>
                    <span className="text-stone-200">{formatNumber(buyTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Sell total</span>
                    <span className="text-stone-200">{formatNumber(sellTotal)}</span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={busySide !== null || demoMode || !token || walletDust < buyTotal}
                    onClick={() => void handleTrade('buy')}
                    className="border border-[#b49664]/45 bg-[#b49664]/10 px-3 py-3 text-[10px] uppercase tracking-[0.18em] text-stone-100 transition hover:border-[#f0d8ad]/70 hover:bg-[#b49664]/16 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busySide === 'buy' ? 'Buying...' : 'Buy'}
                  </button>
                  <button
                    type="button"
                    disabled={busySide !== null || demoMode || !token || selectedListing.owned_amount < safeQuantity}
                    onClick={() => void handleTrade('sell')}
                    className="border border-white/10 bg-black/40 px-3 py-3 text-[10px] uppercase tracking-[0.18em] text-stone-300 transition hover:border-stone-500 hover:text-stone-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busySide === 'sell' ? 'Selling...' : 'Sell'}
                  </button>
                </div>

                <div className="mt-4 text-xs leading-6 text-stone-500">{selectedListing.settlement}</div>
              </>
            ) : (
              <div className="mt-5 text-sm leading-6 text-stone-500">Select a relic listing to open the trade desk.</div>
            )}

            {message && (
              <div className="mt-4 flex items-start gap-2 border border-emerald-400/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>{message}</span>
              </div>
            )}
            {error && <div className="mt-4 border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm text-red-100">{error}</div>}
            {boardError && board && <div className="mt-4 border border-amber-400/20 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">{boardError}</div>}
          </section>

          <section className="border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Season Window</div>
                <h3 className="mt-2 font-body text-xl font-light uppercase tracking-[0.16em] text-stone-100">Featured</h3>
              </div>
              <Crown size={18} className="text-[#d7a852]" />
            </div>
            <div className="mt-5 space-y-3">
              {featuredListings.map((listing) => (
                <div key={listing.relic_type} className="border border-white/8 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.18em] text-stone-500">{listing.family}</div>
                      <div className="mt-1 text-sm uppercase tracking-[0.12em] text-stone-100">{listing.display_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] uppercase tracking-[0.18em] text-stone-500">Ask</div>
                      <div className="mt-1 text-sm text-stone-200">{formatNumber(listing.ask_price)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Wallet Pressure</div>
              <WalletCards size={17} className="text-stone-500" />
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-3xl font-light leading-none tracking-[0.04em] text-stone-100">{formatNumber(walletDust)}</div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">Dust liquid across all sections</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[10px] uppercase tracking-[0.18em]">
                <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                  <div>Forge Cost</div>
                  <div className="mt-2 text-stone-100">{formatNumber(economy?.costs.forge ?? 100)}</div>
                </div>
                <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                  <div>PvP Stake</div>
                  <div className="mt-2 text-stone-100">{formatNumber(economy?.costs.pvp_stake ?? 30)}</div>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="border border-white/8 bg-[#0a0a0a]/92">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-6 py-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Broker Lane</div>
              <h2 className="mt-2 font-body text-xl font-light uppercase tracking-[0.18em] text-stone-100">Card Offers</h2>
            </div>
            <div className="flex items-center gap-5 text-[10px] uppercase tracking-[0.18em] text-stone-600">
              <span className="inline-flex items-center gap-2"><Shield size={14} /> Read-only for now</span>
              <span className="inline-flex items-center gap-2"><Swords size={14} /> Dust settlement later</span>
            </div>
          </div>
          <div className="space-y-4 px-6 py-6">
            {brokerOffers.length > 0 ? brokerOffers.map((offer) => (
              <HeroOfferRow key={offer.id} offer={offer} />
            )) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center border border-dashed border-white/10 bg-black/25 text-center">
                <Swords size={30} className="text-stone-600" />
                <div className="mt-4 text-sm uppercase tracking-[0.22em] text-stone-400">No broker offers</div>
                <div className="mt-2 max-w-sm text-sm leading-6 text-stone-600">Forge or unlock more cards before the broker lane has enough stock to surface.</div>
              </div>
            )}
          </div>
        </section>

        <aside className="border border-white/8 bg-black/20 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Order Tape</div>
              <h3 className="mt-2 font-body text-xl font-light uppercase tracking-[0.16em] text-stone-100">Recent Flow</h3>
            </div>
            <Sparkles size={17} className="text-[#d7a852]" />
          </div>

          <div className="mt-5 space-y-3">
            {orderFeed.map((entry) => (
              <div key={entry.id} className="border border-white/8 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] uppercase tracking-[0.18em] text-stone-300">{entry.label}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">{entry.action}</div>
                  </div>
                  <Gem size={14} className="mt-0.5 shrink-0 text-stone-600" />
                </div>
                <div className="mt-3 text-xs leading-5 text-stone-500">{entry.note}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-white/8 pt-5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-stone-500">
              <Clock3 size={15} />
              Market Notes
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-stone-500">
              {marketNotes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
