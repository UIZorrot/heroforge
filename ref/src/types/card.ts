export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';

export type CardType = 'warrior' | 'mage' | 'rogue' | 'tank' | 'support';

export interface HeroCard {
  id: string;
  name: string;
  imageUrl: string;
  rarity: Rarity;
  type: CardType;
  bp: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  skills: Skill[];
  createdAt: number;
  isFavorite?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  type: 'damage' | 'control' | 'buff' | 'heal';
  power: number;
  cooldown: number;
}

export interface BattleLog {
  round: number;
  attacker: string;
  defender: string;
  action: string;
  damage?: number;
  effect?: string;
  timestamp: number;
}

export interface DuelResult {
  id: string;
  heroA: HeroCard;
  heroB: HeroCard;
  winner: string;
  logs: BattleLog[];
  duration: number;
  timestamp: number;
  commentary?: string;
}