import type { HeroCard, Skill, Rarity, CardType } from '../types/card';

const cardTypes: CardType[] = ['warrior', 'mage', 'rogue', 'tank', 'support'];
const rarities: Rarity[] = ['common', 'rare', 'epic', 'mythic'];

const skillTemplates = {
  damage: [
    { name: 'Crushing Blow', description: 'Deal massive physical damage', power: 120 },
    { name: 'Flame Strike', description: 'Burn the enemy with fire', power: 100 },
    { name: 'Shadow Slash', description: 'Quick dark damage', power: 90 },
    { name: 'Thunder Bolt', description: 'Lightning strike from above', power: 110 },
  ],
  control: [
    { name: 'Stun Lock', description: 'Paralyze the enemy', power: 60 },
    { name: 'Freeze', description: 'Freeze target in place', power: 50 },
    { name: 'Silence', description: 'Prevent skill usage', power: 40 },
    { name: 'Blind', description: 'Reduce accuracy', power: 45 },
  ],
  buff: [
    { name: 'Battle Cry', description: 'Increase ATK', power: 80 },
    { name: 'Iron Skin', description: 'Increase DEF', power: 70 },
    { name: 'Haste', description: 'Increase SPD', power: 60 },
    { name: 'Focus', description: 'Increase critical chance', power: 75 },
  ],
  heal: [
    { name: 'Healing Light', description: 'Restore HP', power: 100 },
    { name: 'Regeneration', description: 'HP over time', power: 80 },
    { name: 'Life Drain', description: 'Steal HP', power: 90 },
    { name: 'Divine Shield', description: 'Block damage', power: 85 },
  ],
};

function generateRandomSkills(count: number = 3): Skill[] {
  const skills: Skill[] = [];
  const types = Object.keys(skillTemplates) as Array<keyof typeof skillTemplates>;
  
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const templates = skillTemplates[type];
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    skills.push({
      id: `skill_${Date.now()}_${i}`,
      name: template.name,
      description: template.description,
      type,
      power: template.power + Math.floor(Math.random() * 20),
      cooldown: Math.floor(Math.random() * 3) + 1,
    });
  }
  
  return skills;
}

function calculateBP(hp: number, atk: number, def: number, speed: number): number {
  return Math.floor(hp * 0.5 + atk * 2 + def * 1.5 + speed * 1.2);
}

export function generateHeroCard(imageUrl: string, name?: string): HeroCard {
  const rarity = rarities[Math.floor(Math.random() * rarities.length)];
  const type = cardTypes[Math.floor(Math.random() * cardTypes.length)];
  
  // Base stats influenced by rarity
  const rarityMultiplier = {
    common: 1,
    rare: 1.2,
    epic: 1.5,
    mythic: 2,
  }[rarity];
  
  const hp = Math.floor((800 + Math.random() * 400) * rarityMultiplier);
  const atk = Math.floor((80 + Math.random() * 40) * rarityMultiplier);
  const def = Math.floor((60 + Math.random() * 30) * rarityMultiplier);
  const speed = Math.floor((70 + Math.random() * 30) * rarityMultiplier);
  
  const skills = generateRandomSkills(rarity === 'mythic' ? 4 : 3);
  const bp = calculateBP(hp, atk, def, speed);
  
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name || `Hero ${Math.floor(Math.random() * 9999)}`,
    imageUrl,
    rarity,
    type,
    bp,
    hp,
    atk,
    def,
    speed,
    skills,
    createdAt: Date.now(),
    isFavorite: false,
  };
}