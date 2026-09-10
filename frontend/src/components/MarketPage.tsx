import { useEffect, useMemo, useState } from 'react';
import { Check, Crown, Gem, Search, ShoppingBag, Sparkles, WalletCards } from 'lucide-react';
import { buyDiamondPack, buyDustPack, buyMarketRelic, fetchMarketBoard, sellMarketRelic } from '../lib/api';
import { PageHeader, PageHeaderStat } from './PageHeader';
import { mockRelicCatalog } from '../lib/mockContent';
import { DustIcon } from './CurrencyIcons';
import { getRelicCategory, getRelicIconSrc, getRelicKind, type RelicCategory } from '../lib/relics';
import { currentIsoWeekKey, resolvePurchaseWindow } from '../lib/marketShop';
import type { CurrencyDiamondPack, CurrencyDustPack, EconomySnapshot, MarketBoardSnapshot, MarketRelicListing, SavedHero } from '../types';

type MarketPageProps = {
  heroes: SavedHero[];
  economy: EconomySnapshot | null;
  token?: string | null;
  demoMode?: boolean;
  onEconomyChange?: (economy: EconomySnapshot) => void;
};

type MarketBoardTab = 'shards' | 'relics' | 'currency';

const rarityTone: Record<MarketRelicListing['rarity'], { text: string; border: string; chip: string; glow: string }> = {
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
  const kind = getRelicKind(relic);
  const purchaseWindow = resolvePurchaseWindow({ relic_type: relic.relic_type, kind });
  const purchasable = purchaseWindow !== null;
  const tierPrice = tierBasePrice[relic.tier] ?? tierBasePrice.common;
  const demandScalar = relic.is_limited ? 1.55 : relic.tier === 'epic' ? 1.24 : relic.tier === 'rare' ? 1.08 : 1;
  const askPrice = Math.round(tierPrice * demandScalar + index * 17);
  const spread = Math.max(18, Math.round(askPrice * (relic.is_limited ? 0.16 : relic.tier === 'epic' ? 0.12 : 0.11)));
  const bidPrice = Math.max(1, askPrice - spread);

  let marketDepth = 12 + (index % 5);
  let trend: MarketRelicListing['trend'] = index % 3 === 0 ? 'soft' : 'firm';
  let settlement = purchasable ? 'Instant settlement' : 'Not currently listed';

  if (purchaseWindow === 'weekly' || relic.is_limited) {
    marketDepth = 1;
    trend = 'hot';
    settlement = 'Weekly window · limited stock';
  } else if (purchaseWindow === 'stock') {
    marketDepth = 4 + (index % 2);
    trend = 'firm';
    settlement = 'Always in stock';
  } else if (kind === 'shard') {
    settlement = 'Instant settlement';
  }

  return {
    relic_type: relic.relic_type,
    display_name: relic.display_name,
    family: relic.family,
    kind,
    tier: relic.tier,
    rarity: relic.tier === 'limited' || relic.tier === 'legendary' ? 'mythic' : relic.tier,
    category: getRelicCategory(relic),
    icon_path: getRelicIconSrc(relic),
    lore_summary: relic.lore_summary,
    effect_profile: relic.effect_profile,
    forge_bias: relic.forge_bias,
    battle_bias: relic.battle_bias,
    is_limited: relic.is_limited,
    purchasable,
    purchase_window: purchaseWindow,
    ask_price: askPrice,
    bid_price: bidPrice,
    spread,
    market_depth: marketDepth,
    owned_amount: Math.max(0, ownedAmount),
    trend,
    settlement,
  };
}

function buildDemoMarketBoard(_heroes: SavedHero[], economy: EconomySnapshot | null): MarketBoardSnapshot {
  const sourceCatalog = economy?.relic_catalog?.length ? economy.relic_catalog : mockRelicCatalog;
  const ownedAmounts = new Map((economy?.relics ?? []).map((entry) => [entry.relic_type, entry.amount]));
  const allListings = sourceCatalog.map((relic, index) =>
    buildDemoRelicListing(relic, index, ownedAmounts.get(relic.relic_type) ?? 0)
  );
  const shardListings = allListings
    .filter((listing) => getRelicKind({ relic_type: listing.relic_type, kind: listing.kind }) === 'shard')
    .sort((a, b) => a.ask_price - b.ask_price);
  const relicListings = allListings
    .filter((listing) => getRelicKind({ relic_type: listing.relic_type, kind: listing.kind }) === 'relic' && listing.purchasable)
    .sort((a, b) => (a.purchase_window === 'weekly' ? 0 : 1) - (b.purchase_window === 'weekly' ? 0 : 1) || b.ask_price - a.ask_price);
  const featuredRelics = relicListings.filter((listing) => listing.purchase_window === 'weekly');
  const weekKey = currentIsoWeekKey();
  const marketTransactions = (economy?.transactions ?? [])
    .filter((entry) => entry.reason === 'market_buy_relic' || entry.reason === 'market_sell_relic')
    .slice(0, 6);
  const tapeSource = [...shardListings, ...relicListings];
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
      : tapeSource.slice(0, 6).map((listing, index) => ({
          id: listing.relic_type,
          label: `${listing.display_name} / ${listing.family}`,
          action: index % 2 === 0 ? 'Bid stack forming' : 'Offer stack refreshed',
          note: index % 2 === 0 ? `Buy wall ${formatNumber(listing.bid_price)}` : `Ask ${formatNumber(listing.ask_price)} / depth ${listing.market_depth}`,
        }));

  return {
    generated_at: new Date().toISOString(),
    week_key: weekKey,
    shard_listings: shardListings,
    relic_listings: relicListings,
    featured_relics: featuredRelics,
    weekly_special_types: featuredRelics.map((row) => row.relic_type),
    stock_relic_types: relicListings.filter((row) => row.purchase_window === 'stock').map((row) => row.relic_type),
    broker_offers: [],
    order_tape: orderTape,
    notes: [
      'Shards are always available and settle instantly in dust.',
      'Equipment relics are limited to a small stock shelf plus weekly specials.',
      'Cards cannot be bought or sold on the market.',
      `Weekly special window: ${weekKey}.`,
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
    listing.trend === 'hot' ? 'text-[#f0d8ad]' : listing.trend === 'firm' ? 'text-sky-200' : 'text-stone-400';
  const windowLabel =
    listing.purchase_window === 'weekly'
      ? 'Weekly'
      : listing.purchase_window === 'stock'
        ? 'Stock'
        : listing.kind === 'shard'
          ? 'Open'
          : null;

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
              {windowLabel && (
                <div className="absolute left-2 top-2 border border-[#b49664]/40 bg-black/65 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.18em] text-[#f0d8ad]">
                  {windowLabel}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${tone.text}`}>{listing.family}</div>
              <h3 className="mt-1 truncate font-body text-lg font-light uppercase tracking-[0.12em] text-stone-100">{listing.display_name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-stone-500">
                <span className={`border px-2 py-1 ${tone.chip}`}>{listing.tier}</span>
                <span className="border border-white/10 px-2 py-1 text-stone-400">
                  {getRelicKind({ relic_type: listing.relic_type, kind: listing.kind }) === 'shard' ? 'Shard' : 'Relic'}
                </span>
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

export function MarketPage({ heroes, economy, token, demoMode = false, onEconomyChange }: MarketPageProps) {
  const [board, setBoard] = useState<MarketBoardSnapshot | null>(demoMode ? buildDemoMarketBoard(heroes, economy) : null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(!demoMode);
  const [boardTab, setBoardTab] = useState<MarketBoardTab>('shards');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RelicCategory | 'all'>('all');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busySide, setBusySide] = useState<'buy' | 'sell' | null>(null);
  const [busyPack, setBusyPack] = useState<string | null>(null);
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

  const shardListings = board?.shard_listings ?? [];
  const relicListings = board?.relic_listings ?? [];
  const activeListings = boardTab === 'shards' ? shardListings : relicListings;
  const filteredListings = useMemo(
    () => activeListings.filter((listing) => listingMatches(listing, normalizedQuery, boardTab === 'shards' ? 'all' : category)),
    [activeListings, boardTab, category, normalizedQuery]
  );
  const featuredListings = board?.featured_relics ?? [];
  const marketNotes = board?.notes ?? [];
  const weekKey = board?.week_key ?? currentIsoWeekKey();

  useEffect(() => {
    if (!filteredListings.length) {
      setSelectedListingId('');
      return;
    }
    if (!filteredListings.some((listing) => listing.relic_type === selectedListingId)) {
      setSelectedListingId(filteredListings[0]?.relic_type ?? '');
    }
  }, [filteredListings, selectedListingId]);

  const walletDust = economy?.wallet?.dust_balance ?? economy?.starter.dust_balance ?? 0;
  const walletDiamonds = economy?.wallet?.diamond_balance ?? 0;
  const currencyShop = economy?.shop ?? null;
  const pricedPool = [...shardListings, ...relicListings].sort((a, b) => a.ask_price - b.ask_price);
  const medianAsk = pricedPool.length > 0 ? pricedPool[Math.floor(pricedPool.length / 2)]?.ask_price ?? 0 : 0;
  const selectedListing =
    filteredListings.find((listing) => listing.relic_type === selectedListingId)
    ?? filteredListings[0]
    ?? null;
  const safeQuantity = Math.max(1, Math.min(99, Math.floor(quantity || 1)));
  const buyTotal = selectedListing ? selectedListing.ask_price * safeQuantity : 0;
  const sellTotal = selectedListing ? selectedListing.bid_price * safeQuantity : 0;
  const canBuy = Boolean(selectedListing?.purchasable !== false);

  async function refreshBoardAfterTrade() {
    if (!demoMode && token) {
      await loadLiveBoard(token);
    }
  }

  async function handleBuyDiamondPack(pack: CurrencyDiamondPack) {
    if (busyPack) return;
    setBusyPack(pack.id);
    setError(null);
    setMessage(null);
    try {
      if (demoMode) {
        const base = economy;
        if (!base?.wallet) throw new Error('Sandbox economy is unavailable.');
        onEconomyChange?.({
          ...base,
          wallet: { ...base.wallet, diamond_balance: (base.wallet.diamond_balance ?? 0) + pack.diamonds, updated_at: new Date().toISOString() },
        });
      } else {
        if (!token) throw new Error('Sign in to purchase currency.');
        const result = await buyDiamondPack(pack.id, token);
        onEconomyChange?.(result.economy);
      }
      setMessage(`Test purchase complete: +${formatNumber(pack.diamonds)} Gems (${pack.title}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gem purchase failed');
    } finally {
      setBusyPack(null);
    }
  }

  async function handleBuyDustPack(pack: CurrencyDustPack) {
    if (busyPack) return;
    setBusyPack(pack.id);
    setError(null);
    setMessage(null);
    try {
      if (demoMode) {
        const base = economy;
        if (!base?.wallet) throw new Error('Sandbox economy is unavailable.');
        const diamonds = base.wallet.diamond_balance ?? 0;
        if (diamonds < pack.diamonds) throw new Error('Not enough Gems in the sandbox.');
        onEconomyChange?.({
          ...base,
          wallet: {
            ...base.wallet,
            diamond_balance: diamonds - pack.diamonds,
            dust_balance: base.wallet.dust_balance + pack.dust,
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        if (!token) throw new Error('Sign in to purchase currency.');
        const result = await buyDustPack(pack.id, token);
        onEconomyChange?.(result.economy);
      }
      setMessage(`Converted ${pack.diamonds} Gems into ${formatNumber(pack.dust)} Dust (${pack.title}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dust purchase failed');
    } finally {
      setBusyPack(null);
    }
  }

  async function handleTrade(side: 'buy' | 'sell') {    if (!selectedListing) return;
    if (side === 'buy' && selectedListing.purchasable === false) {
      setError('This item is not currently available for purchase.');
      return;
    }
    if (demoMode) {
      const totalPrice = side === 'buy' ? buyTotal : sellTotal;
      const ownedAmount = selectedListing.owned_amount;
      if (side === 'buy' && walletDust < totalPrice) {
        setError('Insufficient sandbox Dust.');
        return;
      }
      if (side === 'sell' && ownedAmount < safeQuantity) {
        setError('Not enough inventory in the sandbox.');
        return;
      }
      setBusySide(side);
      setError(null);
      setMessage(null);
      const timestamp = new Date().toISOString();
      const delta = side === 'buy' ? safeQuantity : -safeQuantity;
      const dustDelta = side === 'buy' ? -totalPrice : totalPrice;
      const base = economy;
      if (!base?.wallet) {
        setError('Sandbox economy is unavailable.');
        setBusySide(null);
        return;
      }
      const matchingRelic = base.relics.find((relic) => relic.relic_type === selectedListing.relic_type);
      const nextRelics = matchingRelic
        ? base.relics.map((relic) =>
            relic.relic_type === selectedListing.relic_type
              ? { ...relic, amount: Math.max(0, relic.amount + delta), updated_at: timestamp }
              : relic
          )
        : [
            ...base.relics,
            {
              user_id: base.wallet.user_id,
              relic_type: selectedListing.relic_type,
              amount: Math.max(0, delta),
              created_at: timestamp,
              updated_at: timestamp,
            },
          ];
      const nextDust = Math.max(0, base.wallet.dust_balance + dustDelta);
      onEconomyChange?.({
        ...base,
        wallet: { ...base.wallet, dust_balance: nextDust, updated_at: timestamp },
        relics: nextRelics,
        transactions: [
          {
            id: `mock-market-${Date.now()}`,
            resource_type: 'dust',
            delta: dustDelta,
            balance_after: nextDust,
            reason: side === 'buy' ? 'market_buy_relic' : 'market_sell_relic',
            metadata: { relic_type: selectedListing.relic_type, quantity: safeQuantity, total_price: totalPrice },
            created_at: timestamp,
          },
          ...base.transactions,
        ],
      });
      setMessage(
        side === 'buy'
          ? `Purchased ${safeQuantity} ${selectedListing.display_name} for ${formatNumber(totalPrice)} sandbox Dust.`
          : `Sold ${safeQuantity} ${selectedListing.display_name} for ${formatNumber(totalPrice)} sandbox Dust.`
      );
      setBusySide(null);
      return;
    }
    if (!token) {
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
    <div className="mx-auto max-w-[1540px] px-6 py-8 2xl:px-8">
      <PageHeader
        title="Market"
        eyebrow="Exchange"
        subtitle="Exchange Hall"
        description="Trade shards, relics, and currency."
        stats={
          <>
            <PageHeaderStat label="Shard SKUs" value={shardListings.length} />
            <PageHeaderStat label="Relic SKUs" value={relicListings.length} />
            <PageHeaderStat label="Weekly Window" value={weekKey.replace(/^\d+-W/, 'W')} />
            <PageHeaderStat label="Dust Reserve" value={formatNumber(walletDust)} />
          </>
        }
      />

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="border border-white/8 bg-[#0a0a0a]/92">
          <div className="flex flex-col gap-5 border-b border-white/8 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Exchange Board</div>
                <h2 className="mt-2 font-body text-xl font-light uppercase tracking-[0.18em] text-stone-100">
                  {boardTab === 'shards' ? 'Shard Stall' : boardTab === 'relics' ? 'Relic Counter' : 'Currency Exchange'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setBoardTab('shards')} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${sectionButton(boardTab === 'shards')}`}>
                  Shards
                </button>
                <button type="button" onClick={() => setBoardTab('relics')} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${sectionButton(boardTab === 'relics')}`}>
                  Relics
                </button>
                <button type="button" onClick={() => setBoardTab('currency')} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${sectionButton(boardTab === 'currency')}`}>
                  Currency
                </button>
              </div>
              {boardTab === 'relics' && (
                <div className="flex flex-wrap items-center gap-2">
                  {(['all', 'weapon', 'armor', 'accessory', 'artifact'] as Array<RelicCategory | 'all'>).map((item) => (
                    <button key={item} type="button" onClick={() => setCategory(item)} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition ${sectionButton(category === item)}`}>
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {boardTab !== 'currency' && (
            <div className="flex h-10 min-w-[260px] items-center border border-white/10 bg-black/35 px-3">
              <Search size={15} className="mr-2 text-stone-600" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={boardTab === 'shards' ? 'Search shard or family...' : 'Search relic, family, or effect...'}
                className="w-full bg-transparent text-sm text-stone-300 outline-none placeholder:text-stone-600"
              />
            </div>
            )}
          </div>

          {boardTab !== 'currency' && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-[10px] uppercase tracking-[0.18em] text-stone-600">
            <span>
              {filteredListings.length} {boardTab === 'shards' ? 'shards' : 'relics'} visible · median ask {formatNumber(medianAsk)}
            </span>
            <span>
              {boardTab === 'shards'
                ? 'All shards are buyable.'
                : 'Stock shelf + weekly specials only.'}
            </span>
          </div>
          )}

          {boardError && !board && boardTab !== 'currency' && (
            <div className="px-6 pb-4">
              <div className="border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm text-red-100">{boardError}</div>
            </div>
          )}

          {boardTab === 'currency' ? (
            <div className="space-y-6 px-6 pb-6">
              <div className="border border-sky-300/15 bg-sky-400/5 px-4 py-3 text-xs leading-5 text-sky-100/80">
                Simulated checkout while real payments are deferred. Test purchases credit Gems instantly and are logged as test transactions.
              </div>

              <div>
                <div className="flex items-end justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-sky-300">Gem Top-Up</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Balance {formatNumber(walletDiamonds)} Gems</div>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  {(currencyShop?.diamond_packs ?? []).map((pack) => (
                    <div key={pack.id} className="flex flex-col border border-white/8 bg-black/30 p-4">
                      <Gem size={18} className="text-sky-300" />
                      <div className="mt-3 text-sm uppercase tracking-[0.14em] text-stone-100">{pack.title}</div>
                      <div className="mt-2 text-2xl font-light text-stone-100">{formatNumber(pack.diamonds)}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-stone-500">Gems</div>
                      <button
                        type="button"
                        onClick={() => void handleBuyDiamondPack(pack)}
                        disabled={busyPack !== null}
                        className="mt-4 border border-sky-300/30 bg-sky-400/10 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {busyPack === pack.id ? 'Processing' : `¥${pack.price_cny} · Test Buy`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-end justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Dust Packs</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">
                    1 Gem = {formatNumber(currencyShop?.dust_per_diamond ?? 100)} Dust
                  </div>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  {(currencyShop?.dust_packs ?? []).map((pack) => {
                    const affordable = walletDiamonds >= pack.diamonds;
                    return (
                      <div key={pack.id} className="flex flex-col border border-white/8 bg-black/30 p-4">
                        <DustIcon size={18} className="text-[#c4a574]" />
                        <div className="mt-3 text-sm uppercase tracking-[0.14em] text-stone-100">{pack.title}</div>
                        <div className="mt-2 text-2xl font-light text-stone-100">{formatNumber(pack.dust)}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-stone-500">Dust</div>
                        <button
                          type="button"
                          onClick={() => void handleBuyDustPack(pack)}
                          disabled={busyPack !== null || !affordable}
                          className="mt-4 border border-[#b49664]/40 bg-[#b49664]/10 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0d8ad] transition hover:bg-[#b49664]/20 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {busyPack === pack.id ? 'Processing' : `${pack.diamonds} Gems`}
                        </button>
                        {!affordable && <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-stone-600">Not enough Gems</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
          <div className="px-6 pb-6">
            {loadingBoard && !board ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center border border-dashed border-white/10 bg-black/25 text-center">
                <ShoppingBag size={32} className="text-stone-600" />
                <div className="mt-4 text-sm uppercase tracking-[0.22em] text-stone-400">Loading market board</div>
                <div className="mt-2 max-w-sm text-sm leading-6 text-stone-600">Fetching shard and relic shop listings from the server.</div>
              </div>
            ) : filteredListings.length > 0 ? (
              <div className="grid gap-4 2xl:grid-cols-2">
                {filteredListings.map((listing) => (
                  <ListingTile
                    key={listing.relic_type}
                    listing={listing}
                    active={selectedListing?.relic_type === listing.relic_type}
                    onSelect={() => setSelectedListingId(listing.relic_type)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[260px] flex-col items-center justify-center border border-dashed border-white/10 bg-black/25 text-center">
                <ShoppingBag size={32} className="text-stone-600" />
                <div className="mt-4 text-sm uppercase tracking-[0.22em] text-stone-400">No matching listings</div>
                <div className="mt-2 max-w-sm text-sm leading-6 text-stone-600">
                  {boardTab === 'relics'
                    ? 'Only stock and weekly special relics appear here.'
                    : 'Adjust your search terms.'}
                </div>
              </div>
            )}
          </div>
          )}
        </section>

        <aside className="space-y-5">
          {boardTab === 'currency' ? (
            <section className="border border-white/8 bg-black/20 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Balances</div>
                  <h3 className="mt-2 font-body text-xl font-light uppercase tracking-[0.16em] text-stone-100">Currency</h3>
                </div>
                <Gem size={18} className="text-sky-300" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-[10px] uppercase tracking-[0.18em]">
                <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                  <div>Gems</div>
                  <div className="mt-2 text-sky-200">{formatNumber(walletDiamonds)}</div>
                </div>
                <div className="border border-white/8 bg-black/30 px-3 py-3 text-stone-500">
                  <div>Dust</div>
                  <div className="mt-2 text-stone-100">{formatNumber(walletDust)}</div>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-stone-500">
                Gems are the premium currency. Convert them into Dust here; the exchange never sells Gems for Dust.
              </p>
              {message && <div className="mt-4 border border-[#b49664]/30 bg-[#b49664]/8 px-3 py-3 text-xs text-[#f0d8ad]">{message}</div>}
              {error && <div className="mt-4 border border-red-400/20 bg-red-500/10 px-3 py-3 text-xs text-red-100">{error}</div>}
            </section>
          ) : (
          <section className="border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Trade Desk</div>
                <h3 className="mt-2 font-body text-xl font-light uppercase tracking-[0.16em] text-stone-100">
                  {selectedListing?.display_name ?? 'No Listing'}
                </h3>
              </div>
              <ShoppingBag size={18} className="text-[#d7a852]" />
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
                    <div>Window</div>
                    <div className="mt-2 text-stone-100">{selectedListing.purchase_window ?? 'closed'}</div>
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
                    disabled={busySide !== null || (!demoMode && !token) || !canBuy || walletDust < buyTotal}
                    onClick={() => void handleTrade('buy')}
                    className="border border-[#b49664]/45 bg-[#b49664]/10 px-3 py-3 text-[10px] uppercase tracking-[0.18em] text-stone-100 transition hover:border-[#f0d8ad]/70 hover:bg-[#b49664]/16 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busySide === 'buy' ? 'Buying...' : 'Buy'}
                  </button>
                  <button
                    type="button"
                    disabled={busySide !== null || (!demoMode && !token) || selectedListing.owned_amount < safeQuantity}
                    onClick={() => void handleTrade('sell')}
                    className="border border-white/10 bg-black/40 px-3 py-3 text-[10px] uppercase tracking-[0.18em] text-stone-300 transition hover:border-stone-500 hover:text-stone-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busySide === 'sell' ? 'Selling...' : 'Sell'}
                  </button>
                </div>

                <div className="mt-4 text-xs leading-6 text-stone-500">{selectedListing.settlement}</div>
              </>
            ) : (
              <div className="mt-5 text-sm leading-6 text-stone-500">Select a listing to open the trade desk.</div>
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
          )}

          <section className="border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Weekly Specials</div>
                <h3 className="mt-2 font-body text-xl font-light uppercase tracking-[0.16em] text-stone-100">{weekKey}</h3>
              </div>
              <Crown size={18} className="text-[#d7a852]" />
            </div>
            <div className="mt-5 space-y-3">
              {featuredListings.length > 0 ? (
                featuredListings.map((listing) => (
                  <button
                    key={listing.relic_type}
                    type="button"
                    onClick={() => {
                      setBoardTab('relics');
                      setSelectedListingId(listing.relic_type);
                    }}
                    className="w-full border border-white/8 bg-black/30 p-3 text-left transition hover:border-[#b49664]/40"
                  >
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
                  </button>
                ))
              ) : (
                <div className="border border-dashed border-white/10 px-3 py-6 text-center text-xs uppercase tracking-[0.18em] text-stone-600">
                  No weekly specials loaded
                </div>
              )}
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
        <section className="border border-white/8 bg-[#0a0a0a]/92 px-6 py-6">
          <div className="flex items-center justify-between border-b border-white/8 pb-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Market Policy</div>
              <h2 className="mt-2 font-body text-xl font-light uppercase tracking-[0.18em] text-stone-100">No Card Sales</h2>
            </div>
            <ShoppingBag size={18} className="text-stone-500" />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#d8b06c]">Shards</div>
              <p className="mt-3 text-sm leading-6 text-stone-400">All enchant materials stay listed and buyable at any time.</p>
            </div>
            <div className="border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#d8b06c]">Relics</div>
              <p className="mt-3 text-sm leading-6 text-stone-400">Only a stock shelf plus weekly specials can be purchased. Equip them from Vault.</p>
            </div>
            <div className="border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#d8b06c]">Cards</div>
              <p className="mt-3 text-sm leading-6 text-stone-400">Hero cards are forged, not bought. Market never opens a card purchase desk.</p>
            </div>
          </div>
        </section>

        <aside className="border border-white/8 bg-black/20 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#b49664]">Market Notes</div>
              <h3 className="mt-2 font-body text-xl font-light uppercase tracking-[0.16em] text-stone-100">Trading Rules</h3>
            </div>
            <Sparkles size={17} className="text-[#d7a852]" />
          </div>

          <div className="mt-5 space-y-3 text-sm leading-6 text-stone-500">
            {marketNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <div className="mt-5 border-t border-white/8 pt-5 text-xs leading-5 text-stone-600">
            Your personal trade history lives in Profile · Recent Activity.
          </div>
        </aside>
      </div>
    </div>
  );
}
