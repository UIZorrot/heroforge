
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../../components/layout/Navigation';
import HeroCard from '../../components/cards/HeroCard';
import { cardStorage } from '../../utils/cardStorage';
import { mockCards } from '../../mocks/cards';
import type { HeroCard as HeroCardType, CardType, Rarity } from '../../types/card';

type SortOption = 'bp' | 'date' | 'name';

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

  const mythicCount = cards.filter(c => c.rarity === 'Mythic').length;
  const epicCount = cards.filter(c => c.rarity === 'Epic').length;
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
    <div className="min-h-screen bg-[#080808]">
      <Navigation />

      <main className="relative pt-32 pb-24 px-8">
        <div className="max-w-7xl mx-auto">

          {/* ── Page Title ── */}
          <div className="text-center mb-20">
            <p className="text-stone-600 text-xs italic mb-4">"Archive of legends"</p>
            <h1 className="text-5xl font-light text-stone-200 title-spaced mb-6">
              V A U L T
            </h1>
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="w-1 h-1 rotate-45 border border-stone-800"></div>
              <div className="divider-minimal w-32"></div>
              <div className="w-1 h-1 rotate-45 border border-stone-800"></div>
            </div>

            {/* Stats - Minimal */}
            <div className="flex items-center justify-center gap-12 text-stone-600 text-xs font-mono tracking-extra-wide">
              <div>
                <span className="text-2xl font-light text-gold-matte block mb-1">{mythicCount}</span>
                <span>MYTHIC</span>
              </div>
              <div className="w-px h-8 bg-stone-800"></div>
              <div>
                <span className="text-2xl font-light text-stone-400 block mb-1">{epicCount}</span>
                <span>EPIC</span>
              </div>
              <div className="w-px h-8 bg-stone-800"></div>
              <div>
                <span className="text-2xl font-light text-stone-400 block mb-1">{favoriteCount}</span>
                <span>FAVORITES</span>
              </div>
              <div className="w-px h-8 bg-stone-800"></div>
              <div>
                <span className="text-2xl font-light text-stone-400 block mb-1">{cards.length}</span>
                <span>TOTAL</span>
              </div>
            </div>
          </div>

          {/* ── Filter Bar - Minimal Text Buttons ── */}
          <div className="mb-12">
            {/* Search */}
            <div className="max-w-md mx-auto mb-8">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="w-full bg-transparent border-0 border-b border-stone-800 px-0 py-3 text-stone-200 placeholder-stone-700 focus:outline-none focus:border-gold-matte transition-colors text-sm tracking-wider"
              />
            </div>

            {/* Filters & Sort */}
            <div className="flex items-center justify-center gap-8 text-xs tracking-ultra-wide">
              {/* Type Filter */}
              <div className="flex items-center gap-3">
                <span className="text-stone-600">TYPE</span>
                <div className="flex items-center gap-2">
                  {(['all', 'warrior', 'mage', 'rogue', 'tank', 'support'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-3 py-1 transition-colors cursor-pointer whitespace-nowrap ${
                        filterType === type
                          ? 'text-gold-matte border-b border-gold-matte'
                          : 'text-stone-600 hover:text-stone-400'
                      }`}
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-4 bg-stone-800"></div>

              {/* Rarity Filter */}
              <div className="flex items-center gap-3">
                <span className="text-stone-600">RARITY</span>
                <div className="flex items-center gap-2">
                  {(['all', 'Mythic', 'Epic', 'Rare', 'Common'] as const).map(rarity => (
                    <button
                      key={rarity}
                      onClick={() => setFilterRarity(rarity as Rarity | 'all')}
                      className={`px-3 py-1 transition-colors cursor-pointer whitespace-nowrap ${
                        filterRarity === rarity
                          ? 'text-gold-matte border-b border-gold-matte'
                          : 'text-stone-600 hover:text-stone-400'
                      }`}
                    >
                      {rarity.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-4 bg-stone-800"></div>

              {/* Sort */}
              <div className="flex items-center gap-3">
                <span className="text-stone-600">SORT</span>
                <div className="flex items-center gap-2">
                  {([
                    { value: 'date', label: 'LATEST' },
                    { value: 'bp', label: 'POWER' },
                    { value: 'name', label: 'NAME' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value)}
                      className={`px-3 py-1 transition-colors cursor-pointer whitespace-nowrap ${
                        sortBy === opt.value
                          ? 'text-gold-matte border-b border-gold-matte'
                          : 'text-stone-600 hover:text-stone-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete Selected */}
              {selectedCards.size > 0 && (
                <>
                  <div className="w-px h-4 bg-stone-800"></div>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-1 text-stone-600 hover:text-red-400 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    DELETE ({selectedCards.size})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Cards Grid - 3 Columns with Hairline Dividers ── */}
          {filteredAndSortedCards.length > 0 ? (
            <div className="grid grid-cols-3 gap-x-12 gap-y-16">
              {filteredAndSortedCards.map((card, index) => (
                <div key={card.id} className="relative group">
                  {/* Vertical divider after each card except last in row */}
                  {(index + 1) % 3 !== 0 && (
                    <div className="absolute -right-6 top-0 bottom-0 w-px bg-stone-900"></div>
                  )}

                  {/* Select checkbox - minimal */}
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleSelect(card.id); }}
                    className={`absolute top-3 left-3 z-30 w-5 h-5 border transition-all cursor-pointer ${
                      selectedCards.has(card.id)
                        ? 'bg-gold-matte border-gold-matte'
                        : 'bg-transparent border-stone-700 opacity-0 group-hover:opacity-100 hover:border-gold-matte'
                    }`}
                    style={{ borderWidth: '0.5px' }}
                  >
                    {selectedCards.has(card.id) && (
                      <div className="w-2 h-2 bg-[#080808] mx-auto"></div>
                    )}
                  </button>

                  {/* Favorite button - minimal */}
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleFavorite(card.id); }}
                    className={`absolute top-3 right-3 z-30 w-5 h-5 flex items-center justify-center transition-all cursor-pointer ${
                      card.isFavorite
                        ? 'text-gold-matte'
                        : 'text-stone-700 opacity-0 group-hover:opacity-100 hover:text-gold-matte'
                    }`}
                  >
                    <i className={`${card.isFavorite ? 'ri-star-fill' : 'ri-star-line'} text-xs`}></i>
                  </button>

                  <HeroCard card={card} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-32">
              <div className="w-1 h-1 rotate-45 border border-stone-800 mx-auto mb-8"></div>
              <p className="text-stone-600 text-sm tracking-extra-wide mb-2">NO RELICS FOUND</p>
              <p className="text-stone-700 text-xs tracking-wider mb-12">
                {cards.length === 0 ? 'Begin forging to build your archive' : 'Adjust filters to reveal hidden relics'}
              </p>
              {cards.length === 0 && (
                <Link
                  to="/forge"
                  className="inline-block text-stone-600 text-xs tracking-ultra-wide hover:text-gold-matte transition-colors border-b border-stone-800 hover:border-gold-matte pb-1 cursor-pointer whitespace-nowrap"
                >
                  ENTER FORGE
                </Link>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Confirm Delete Modal - Minimal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#0a0a0a] border border-stone-800 p-12 max-w-md w-full text-center" style={{ borderWidth: '0.5px' }}>
            <div className="w-1 h-1 rotate-45 border border-stone-800 mx-auto mb-8"></div>
            <h3 className="text-lg font-light text-stone-200 tracking-extra-wide mb-2">CONFIRM DELETION</h3>
            <p className="text-stone-600 text-xs tracking-wider mb-12">
              Permanently destroy <span className="text-gold-matte">{selectedCards.size}</span> relic(s)
            </p>
            <div className="flex items-center justify-center gap-8 text-xs tracking-ultra-wide">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-stone-600 hover:text-stone-400 transition-colors border-b border-stone-800 hover:border-stone-600 pb-1 cursor-pointer whitespace-nowrap"
              >
                CANCEL
              </button>
              <div className="w-px h-4 bg-stone-800"></div>
              <button
                onClick={handleDeleteSelected}
                className="text-stone-600 hover:text-red-400 transition-colors border-b border-stone-800 hover:border-red-400 pb-1 cursor-pointer whitespace-nowrap"
              >
                DESTROY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
