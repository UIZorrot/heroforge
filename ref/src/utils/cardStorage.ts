import type { HeroCard, DuelResult } from '../types/card';

const CARDS_KEY = 'hero_forge_cards';
const DUELS_KEY = 'hero_forge_duels';

export const cardStorage = {
  getCards(): HeroCard[] {
    try {
      const data = localStorage.getItem(CARDS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveCard(card: HeroCard): void {
    const cards = this.getCards();
    const existingIndex = cards.findIndex(c => c.id === card.id);
    
    if (existingIndex >= 0) {
      cards[existingIndex] = card;
    } else {
      cards.push(card);
    }
    
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  },

  deleteCard(id: string): void {
    const cards = this.getCards().filter(c => c.id !== id);
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  },

  getCard(id: string): HeroCard | undefined {
    return this.getCards().find(c => c.id === id);
  },

  toggleFavorite(id: string): void {
    const cards = this.getCards();
    const card = cards.find(c => c.id === id);
    if (card) {
      card.isFavorite = !card.isFavorite;
      localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
    }
  },
};

export const duelStorage = {
  getDuels(): DuelResult[] {
    try {
      const data = localStorage.getItem(DUELS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveDuel(duel: DuelResult): void {
    const duels = this.getDuels();
    duels.unshift(duel);
    localStorage.setItem(DUELS_KEY, JSON.stringify(duels.slice(0, 50))); // Keep last 50
  },

  getDuel(id: string): DuelResult | undefined {
    return this.getDuels().find(d => d.id === id);
  },
};

/* 新增的命名导出以兼容页面 import */
export const getCards = () => cardStorage.getCards();