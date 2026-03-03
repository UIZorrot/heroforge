
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../../components/layout/Navigation';
import HeroCard from '../../components/cards/HeroCard';
import { cardStorage } from '../../utils/cardStorage';
import { mockCards } from '../../mocks/cards';
import type { HeroCard as HeroCardType, CardType, Rarity } from '../../types/card';

type SortOption = 'bp' | 'date' | 'name';

const rarityOrder: Record<Rarity, number> = { mythic: 4, epic: 3, rare: 2, common: 1 };

export default function VaultPage() {
  const storedCards = cardStorage.getCards();
  const displayCards = storedCards.length > 0 ? storedCards : mockCards;

  const [cards, setCards] = useState<HeroCardType[]>(displayCards);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<CardType | 'all'>('all');
  const [filterRarity, setFilterRarity] = useState<Rarity | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filteredAndSortedCards = useMemo(() => {
    let result = [...cards];
    if (filterType !== 'all') result = result.filter(c => c.type === filterType);
    if (filterRarity !== 'all') result = result.filter(c => c.rarity === filterRarity);
    if (searchQuery) result = result.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    result.sort((a, b) => {
      if (sortBy === 'bp') return b.bp - a.bp;
      if (sortBy === 'date') return b.createdAt - a.createdAt;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
    return result;
  }, [cards, filterType, filterRarity, sortBy, searchQuery]);

  const mythicCount = cards.filter(c => c.rarity === 'mythic').length;
  const epicCount = cards.filter(c => c.rarity === 'epic').length;
  const favoriteCount = cards.filter(c => c.isFavorite).length;

  const handleToggleSelect = (cardId: string) => {
    const next = new Set(selectedCards);
    next.has(cardId) ? next.delete(cardId) : next.add(cardId);
    setSelectedCards(next);
  };

  const handleDeleteSelected = () => {
    selectedCards.forEach(id => cardStorage.deleteCard(id));
    setCards(cardStorage.getCards());
    setSelectedCards(new Set());
    setConfirmDelete(false);
  };

  const handleToggleFavorite = (cardId: string) => {
    cardStorage.toggleFavorite(cardId);
    setCards(cardStorage.getCards());
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c]">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-violet-600/4 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-amber-400/4 rounded-full blur-[100px]"></div>
      </div>

      <Navigation />

      <main className="relative pt-20 pb-16 px-6">
        <div className="max-w-7xl mx-auto">

          {/* ── Page Header ── */}
          <div className="pt-8 pb-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 mb-3">
                  <i className="ri-archive-fill text-amber-400 text-xs"></i>
                  <span className="text-amber-400/80 text-xs font-mono tracking-widest uppercase">Relic Vault</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-display font-black text-white tracking-wide"
                  style={{ textShadow: '0 0 30px rgba(234,179,8,0.2)' }}>
                  THE <span className="text-amber-400">VAULT</span>
                </h1>
                <p className="text-gray-600 text-sm font-mono mt-1">{cards.length} RELICS COLLECTED</p>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3">
                <StatChip icon="ri-vip-crown-fill" label="Mythic" value={mythicCount} color="text-amber-400" bg="bg-amber-400/10 border-amber-400/20" />
                <StatChip icon="ri-sparkling-fill" label="Epic" value={epicCount} color="text-violet-400" bg="bg-violet-400/10 border-violet-400/20" />
                <StatChip icon="ri-star-fill" label="Favorites" value={favoriteCount} color="text-rose-400" bg="bg-rose-400/10 border-rose-400/20" />
              </div>
            </div>
          </div>

          {/* ── Filter Bar ── */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 mb-6">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                  <i className="ri-search-line text-gray-500 text-sm"></i>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search heroes..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-400/30 transition-all text-sm"
                />
              </div>

              {/* Type filter */}
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value as CardType | 'all')}
                className="px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-gray-300 focus:outline-none focus:border-amber-400/30 transition-all text-sm cursor-pointer appearance-none pr-8"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'%236b7280\' viewBox=\'0 0 20 20\'%3E%3Cpath d=\'M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px' }}
              >
                <option value="all">All Types</option>
                <option value="warrior">Warrior</option>
                <option value="mage">Mage</option>
                <option value="rogue">Rogue</option>
                <option value="tank">Tank</option>
                <option value="support">Support</option>
              </select>

              {/* Rarity filter */}
              <select
                value={filterRarity}
                onChange={e => setFilterRarity(e.target.value as Rarity | 'all')}
                className="px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-gray-300 focus:outline-none focus:border-amber-400/30 transition-all text-sm cursor-pointer appearance-none pr-8"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'%236b7280\' viewBox=\'0 0 20 20\'%3E%3Cpath d=\'M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px' }}
              >
                <option value="all">All Rarities</option>
                <option value="mythic">Mythic</option>
                <option value="epic">Epic</option>
                <option value="rare">Rare</option>
                <option value="common">Common</option>
              </select>

              {/* Sort */}
              <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
                {([
                  { value: 'date', icon: 'ri-time-line', label: 'Latest' },
                  { value: 'bp',   icon: 'ri-fire-line',  label: 'Power' },
                  { value: 'name', icon: 'ri-sort-alphabet-asc', label: 'Name' },
                ] as { value: SortOption; icon: string; label: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                      sortBy === opt.value
                        ? 'bg-amber-400 text-[#0a0a0c]'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <i className={opt.icon}></i>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Delete selected */}
              {selectedCards.size > 0 && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-900/30 border border-rose-500/30 text-rose-400 text-sm font-semibold hover:bg-rose-900/50 transition-all whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-delete-bin-line"></i>
                  Delete ({selectedCards.size})
                </button>
              )}
            </div>
          </div>

          {/* ── Cards Grid ── */}
          {filteredAndSortedCards.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredAndSortedCards.map((card) => (
                <div key={card.id} className="relative group">
                  {/* Select checkbox */}
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleSelect(card.id); }}
                    className={`absolute top-3 left-3 z-30 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${
                      selectedCards.has(card.id)
                        ? 'bg-amber-400 border-amber-400'
                        : 'bg-black/60 border-white/20 opacity-0 group-hover:opacity-100 hover:border-amber-400/60'
                    }`}
                  >
                    {selectedCards.has(card.id) && <i className="ri-check-line text-[#0a0a0c] text-xs font-bold"></i>}
                  </button>

                  {/* Favorite button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleFavorite(card.id); }}
                    className={`absolute top-3 right-3 z-30 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm ${
                      card.isFavorite
                        ? 'bg-amber-400/20 border border-amber-400/50'
                        : 'bg-black/60 border border-white/10 opacity-0 group-hover:opacity-100 hover:border-amber-400/40'
                    }`}
                  >
                    <i className={`${card.isFavorite ? 'ri-star-fill text-amber-400' : 'ri-star-line text-gray-400'} text-xs`}></i>
                  </button>

                  <HeroCard card={card} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-24">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <i className="ri-inbox-line text-5xl text-gray-700"></i>
              </div>
              <h3 className="text-xl font-display font-bold text-gray-500 mb-2">No Relics Found</h3>
              <p className="text-gray-700 text-sm mb-6">
                {cards.length === 0 ? 'Start forging heroes to build your collection' : 'Try adjusting your filters'}
              </p>
              {cards.length === 0 && (
                <Link
                  to="/forge"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-[#0a0a0c] rounded-xl font-bold text-sm hover:bg-amber-300 transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-hammer-fill"></i>
                  Go to Forge
                </Link>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#111318] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-900/30 border border-rose-500/30 flex items-center justify-center">
              <i className="ri-delete-bin-fill text-2xl text-rose-400"></i>
            </div>
            <h3 className="text-lg font-display font-bold text-white mb-2">Delete Relics?</h3>
            <p className="text-gray-500 text-sm mb-6">
              You are about to permanently destroy <span className="text-rose-400 font-bold">{selectedCards.size}</span> relic(s). This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-gray-300 text-sm font-semibold hover:bg-white/[0.08] transition-all cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-500 transition-all cursor-pointer whitespace-nowrap"
              >
                Destroy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ icon, label, value, color, bg }: {
  icon: string; label: string; value: number; color: string; bg: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${bg}`}>
      <div className={`w-4 h-4 flex items-center justify-center ${color}`}>
        <i className={`${icon} text-xs`}></i>
      </div>
      <div>
        <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
        <div className="text-[10px] text-gray-600 leading-none">{label}</div>
      </div>
    </div>
  );
}
