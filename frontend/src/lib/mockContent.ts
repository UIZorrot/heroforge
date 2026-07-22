import type { EconomySnapshot, RelicDefinition, SavedHero } from '../types';
import type { CharacterData, Skill } from './gameLogic';

type MockHeroSkill = Skill;

type MockHeroSpec = {
  id: string;
  name: string;
  type: string;
  image?: string;
  bp: number;
  hp: number;
  mp: number;
  atk: number;
  def: number;
  cc?: number;
  ca?: number;
  pi?: number;
  ev?: number;
  ac?: number;
  speed: number;
  description: string;
  typeCatalog: 'proj' | 'instant';
  typeEffect: string;
  skills: {
    s1: MockHeroSkill;
    s2: MockHeroSkill;
  };
  equippedRelicId?: string | null;
  enchantment?: SavedHero['enchantment'];
};

const nowIso = new Date('2026-06-11T00:00:00.000Z').toISOString();

export const mockRelicCatalog: RelicDefinition[] = [
  { relic_type: 'low_ember_shard', display_name: 'Ember Shard', tier: 'common', family: 'Fire', lore_summary: 'Cinder fragment from a burnt altar.', effect_profile: 'Fire-aligned Forge bias and aggressive archetype bias.', forge_bias: 'fire', battle_bias: 'offense', icon_prompt: 'soulslike item icon, ember shard', is_limited: false },
  { relic_type: 'low_frost_shard', display_name: 'Frost Shard', tier: 'common', family: 'Frost', lore_summary: 'Ice splinter sealed in old glass.', effect_profile: 'Frost-aligned Forge bias and defensive control bias.', forge_bias: 'frost', battle_bias: 'defense', icon_prompt: 'soulslike item icon, frost shard', is_limited: false },
  { relic_type: 'low_radiant_shard', display_name: 'Radiant Shard', tier: 'common', family: 'Light', lore_summary: 'Piece of a sun relic.', effect_profile: 'Light-aligned Forge bias and healing or protection bias.', forge_bias: 'light', battle_bias: 'support', icon_prompt: 'soulslike item icon, radiant shard', is_limited: false },
  { relic_type: 'low_void_shard', display_name: 'Void Shard', tier: 'common', family: 'Void', lore_summary: 'Fragment from an empty shrine.', effect_profile: 'Void-aligned Forge bias and curse or pierce bias.', forge_bias: 'void', battle_bias: 'disruption', icon_prompt: 'soulslike item icon, void shard', is_limited: false },
  { relic_type: 'low_storm_shard', display_name: 'Storm Shard', tier: 'common', family: 'Storm', lore_summary: 'Condensed lightning trapped in crystal.', effect_profile: 'Storm-aligned Forge bias and speed or multi-hit bias.', forge_bias: 'storm', battle_bias: 'tempo', icon_prompt: 'soulslike item icon, storm shard', is_limited: false },
  { relic_type: 'low_beast_fang', display_name: 'Beast Fang', tier: 'common', family: 'Beast', lore_summary: 'Trophy from an ancient predator.', effect_profile: 'Beast-aligned Forge bias and physical pressure bias.', forge_bias: 'beast', battle_bias: 'pressure', icon_prompt: 'soulslike item icon, beast fang', is_limited: false },
  { relic_type: 'named_echo_heart', display_name: 'Echo Heart', tier: 'rare', family: 'Memory', lore_summary: 'A jeweled pendant said to hold the last voices of a fallen kingdom.', effect_profile: 'Raises memory, echo, and persistence-themed outcomes.', forge_bias: 'memory', battle_bias: 'persistence', icon_prompt: 'soulslike item icon, echo heart pendant', is_limited: false },
  { relic_type: 'named_ashen_crown', display_name: 'Ashen Crown', tier: 'rare', family: 'Fire', lore_summary: 'A soot-black crown worn by the last ruler of a burned dynasty.', effect_profile: 'Pushes regal, fire, and high-aggression outcomes.', forge_bias: 'fire', battle_bias: 'authority', icon_prompt: 'soulslike item icon, ashen crown', is_limited: false },
  { relic_type: 'named_oath_lantern', display_name: 'Oath Lantern', tier: 'rare', family: 'Light', lore_summary: 'A lantern sealed with a knightly vow that never went out.', effect_profile: 'Biases paladin, guardian, and support outcomes.', forge_bias: 'light', battle_bias: 'protection', icon_prompt: 'soulslike item icon, oath lantern', is_limited: false },
  { relic_type: 'named_frostbound_reliquary', display_name: 'Frostbound Reliquary', tier: 'rare', family: 'Frost', lore_summary: 'A small reliquary that preserves a winter saint relic.', effect_profile: 'Biases frost, defense, and survival-oriented outcomes.', forge_bias: 'frost', battle_bias: 'control', icon_prompt: 'soulslike item icon, frostbound reliquary', is_limited: false },
  { relic_type: 'named_storm_choir_bell', display_name: 'Storm Choir Bell', tier: 'rare', family: 'Storm', lore_summary: 'A bell once rung to summon a city-wide thunder rite.', effect_profile: 'Biases storm, speed, accuracy, and multi-target skill outcomes.', forge_bias: 'storm', battle_bias: 'tempo', icon_prompt: 'soulslike item icon, storm choir bell', is_limited: false },
  { relic_type: 'named_grave_key_of_auralis', display_name: 'Grave Key of Auralis', tier: 'epic', family: 'Void', lore_summary: 'A black key said to unlock the crypt of an erased kingdom.', effect_profile: 'Biases death, curse, and grave-themed outcomes.', forge_bias: 'void', battle_bias: 'control', icon_prompt: 'soulslike item icon, grave key', is_limited: false },
  { relic_type: 'named_mirror_of_the_first_duel', display_name: 'Mirror of the First Duel', tier: 'epic', family: 'Steel', lore_summary: 'A polished shard that remembers the first formal combat.', effect_profile: 'Biases battle, retaliation, and accuracy-based outcomes.', forge_bias: 'steel', battle_bias: 'retaliation', icon_prompt: 'soulslike item icon, mirror shard relic', is_limited: false },
  { relic_type: 'named_bone_rosary_of_the_silent_march', display_name: 'Bone Rosary of the Silent March', tier: 'epic', family: 'Death', lore_summary: 'Prayer beads made from soldiers who never returned.', effect_profile: 'Biases endurance, formation, and mass-control skills.', forge_bias: 'death', battle_bias: 'formation', icon_prompt: 'soulslike item icon, bone rosary', is_limited: false },
  { relic_type: 'named_sunless_seal', display_name: 'Sunless Seal', tier: 'epic', family: 'Void', lore_summary: 'A wax seal pressed under a starless sky.', effect_profile: 'Biases hidden power and sealed-source outcomes.', forge_bias: 'void', battle_bias: 'sealed', icon_prompt: 'soulslike item icon, sunless seal', is_limited: false },
  { relic_type: 'named_harrow_glass', display_name: 'Harrow Glass', tier: 'epic', family: 'Blood', lore_summary: 'A glass vial containing a battlefield chorus.', effect_profile: 'Biases crowd-control, wound, and damage-over-time pools.', forge_bias: 'blood', battle_bias: 'attrition', icon_prompt: 'soulslike item icon, harrow glass vial', is_limited: false },
  { relic_type: 'named_thorn_votive', display_name: 'Thorn Votive', tier: 'rare', family: 'Nature', lore_summary: 'A candle wrapped in living briars.', effect_profile: 'Biases nature, bleed, and self-sustain outcomes.', forge_bias: 'nature', battle_bias: 'sustain', icon_prompt: 'soulslike item icon, thorn votive candle', is_limited: false },
  { relic_type: 'named_sable_talisman', display_name: 'Sable Talisman', tier: 'rare', family: 'Shadow', lore_summary: 'A charm carried by couriers through cursed roads.', effect_profile: 'Biases speed, evasion, and stealth-like archetypes.', forge_bias: 'shadow', battle_bias: 'evasion', icon_prompt: 'soulslike item icon, sable talisman', is_limited: false },
  { relic_type: 'named_crownless_scepter', display_name: 'Crownless Scepter', tier: 'epic', family: 'Royal', lore_summary: 'A broken scepter from a throne with no heir.', effect_profile: 'Biases authority, buffs, and team support archetypes.', forge_bias: 'royal', battle_bias: 'support', icon_prompt: 'soulslike item icon, crownless scepter', is_limited: false },
  { relic_type: 'limited_eclipse_medal', display_name: 'Eclipse Medal', tier: 'limited', family: 'Celestial', lore_summary: 'A commemorative medal from a darkened rite.', effect_profile: 'Seasonal relic with collector prestige and omen bias.', forge_bias: 'celestial', battle_bias: 'omen', icon_prompt: 'soulslike item icon, eclipse medal', is_limited: true },
  { relic_type: 'limited_blood_moon_seal', display_name: 'Blood Moon Seal', tier: 'limited', family: 'Blood', lore_summary: 'A seal impressed during a crimson lunar event.', effect_profile: 'Limited relic for bleed and frenzy-themed outcomes.', forge_bias: 'blood', battle_bias: 'frenzy', icon_prompt: 'soulslike item icon, blood moon seal', is_limited: true },
  { relic_type: 'limited_frozen_cathedral_token', display_name: 'Frozen Cathedral Token', tier: 'limited', family: 'Frost', lore_summary: 'A token cut from a sanctum lost to winter.', effect_profile: 'Limited relic for frost, silence, and devotion motifs.', forge_bias: 'frost', battle_bias: 'silence', icon_prompt: 'soulslike item icon, frozen cathedral token', is_limited: true },
  { relic_type: 'limited_red_comet_fragment', display_name: 'Red Comet Fragment', tier: 'limited', family: 'Fire', lore_summary: 'A shard said to fall from a red omen in the sky.', effect_profile: 'Limited relic for destructive burst and omen builds.', forge_bias: 'fire', battle_bias: 'burst', icon_prompt: 'soulslike item icon, red comet fragment', is_limited: true },
  { relic_type: 'low_ash_fragment', display_name: 'Ash Fragment', tier: 'common', family: 'Fire', lore_summary: 'Black ember dust sealed in slag.', effect_profile: 'Very basic fire bias and common reward token.', forge_bias: 'fire', battle_bias: 'offense', icon_prompt: 'soulslike item icon, ash fragment', is_limited: false },
  { relic_type: 'low_tide_shard', display_name: 'Tide Shard', tier: 'common', family: 'Water', lore_summary: 'Salted glass from an old sea shrine.', effect_profile: 'Water bias with recovery and fluidity themes.', forge_bias: 'water', battle_bias: 'recovery', icon_prompt: 'soulslike item icon, tide shard', is_limited: false },
  { relic_type: 'low_iron_splinter', display_name: 'Iron Splinter', tier: 'common', family: 'Stone', lore_summary: 'A splinter torn from a fortress plate.', effect_profile: 'Defense bias and bodyguard direction.', forge_bias: 'stone', battle_bias: 'guard', icon_prompt: 'soulslike item icon, iron splinter', is_limited: false },
  { relic_type: 'low_moon_ash', display_name: 'Moon Ash', tier: 'common', family: 'Void', lore_summary: 'Ash that fell under a moonless rite.', effect_profile: 'Void omen flavor and rare-roll helper.', forge_bias: 'void', battle_bias: 'omen', icon_prompt: 'soulslike item icon, moon ash', is_limited: false },
  { relic_type: 'named_lantern_of_the_ninth_bell', display_name: 'Lantern of the Ninth Bell', tier: 'rare', family: 'Light', lore_summary: 'A pilgrimage lantern that only rings at dawn.', effect_profile: 'Strong holy and protection identity with shrine effects.', forge_bias: 'light', battle_bias: 'protection', icon_prompt: 'soulslike item icon, lantern of the ninth bell', is_limited: false },
  { relic_type: 'named_hollow_choir', display_name: 'Hollow Choir', tier: 'epic', family: 'Void', lore_summary: 'A bone choir that sings without mouths.', effect_profile: 'Void and curse identity with dread aesthetics.', forge_bias: 'void', battle_bias: 'control', icon_prompt: 'soulslike item icon, hollow choir relic', is_limited: false },
  { relic_type: 'named_kingless_banner', display_name: 'Kingless Banner', tier: 'epic', family: 'Beast', lore_summary: 'A torn war banner that never bowed.', effect_profile: 'Aggression and battlefield momentum identity.', forge_bias: 'beast', battle_bias: 'momentum', icon_prompt: 'soulslike item icon, kingless banner', is_limited: false },
];

const mockRelicAmounts: Record<string, number> = {
  low_ember_shard: 6,
  low_frost_shard: 5,
  low_radiant_shard: 4,
  low_void_shard: 4,
  low_storm_shard: 3,
  low_beast_fang: 3,
  named_echo_heart: 1,
  named_ashen_crown: 1,
  named_oath_lantern: 1,
  named_frostbound_reliquary: 1,
  named_storm_choir_bell: 1,
  named_grave_key_of_auralis: 1,
  named_mirror_of_the_first_duel: 1,
  named_bone_rosary_of_the_silent_march: 1,
  named_sunless_seal: 1,
  named_harrow_glass: 1,
  named_thorn_votive: 1,
  named_sable_talisman: 1,
  named_crownless_scepter: 1,
  limited_eclipse_medal: 1,
  limited_blood_moon_seal: 1,
  limited_frozen_cathedral_token: 1,
  limited_red_comet_fragment: 1,
  low_ash_fragment: 2,
  low_tide_shard: 2,
  low_iron_splinter: 2,
  low_moon_ash: 2,
  named_lantern_of_the_ninth_bell: 1,
  named_hollow_choir: 1,
  named_kingless_banner: 1,
};

export const mockRelicInventory: EconomySnapshot['relics'] = mockRelicCatalog.map((relic) => ({
  user_id: 'mock-user',
  relic_type: relic.relic_type,
  amount: mockRelicAmounts[relic.relic_type] ?? 1,
  created_at: nowIso,
  updated_at: nowIso,
}));

function character(spec: MockHeroSpec): CharacterData {
  return {
    name: spec.name,
    description: spec.description,
    BP: String(spec.bp),
    template: spec.type,
    state: {
      HP: String(spec.hp),
      MP: String(spec.mp),
      ATK: String(spec.atk),
      DEF: String(spec.def),
      CC: String(spec.cc ?? 18),
      SPEED: String(spec.speed),
      CA: String(spec.ca ?? 12),
      PI: String(spec.pi ?? 10),
      EV: String(spec.ev ?? 8),
      AC: String(spec.ac ?? 8),
      TYPE: spec.type,
      type_catalog: spec.typeCatalog,
      type_effect: spec.typeEffect,
    },
    skill: spec.skills,
  };
}

function hero(spec: MockHeroSpec, index: number): SavedHero {
  return {
    id: spec.id,
    createdAt: Date.now() - index * 3600000,
    image: spec.image,
    character: character(spec),
    equippedRelicId: spec.equippedRelicId ?? null,
    enchantment: spec.enchantment ?? null,
    pvpLifeState: 'active',
    pveLifeState: 'active',
    cardStatus: 'active',
  };
}

export const mockHeroes: SavedHero[] = [
  hero({
    id: 'mock-aurelia',
    name: 'Aurelia',
    type: 'light priest',
    image: '/test/圣洁牧师.png',
    bp: 4300,
    hp: 2200,
    mp: 760,
    atk: 178,
    def: 44,
    cc: 12,
    ca: 10,
    pi: 8,
    speed: 82,
    typeCatalog: 'proj',
    typeEffect: 'holy',
    description: 'A support caster used to test holy projectiles and sustained healing effects.',
    skills: {
      s1: { name: 'Lumen Spear', description: 'Fires a narrow lance of consecrated light.', TYPE: 'holy', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'proj', type_effect: 'holy', DMG: '92', MP_COST: '24' },
      s2: { name: 'Tide of Grace', description: 'Restores an ally with a bright water-lit blessing.', TYPE: 'water', TARGET: 'Ally', TARGET_NUM: '1', RANGE: 'ally', ROLE: 'heal', type_catalog: 'instant', type_effect: 'water', buff_type_effect: 'heal', BUFF_NAME: 'heal', BUFF_TIME: '2', BUFF_HP: '180', MP_COST: '34' },
    },
    equippedRelicId: 'low_radiant_shard',
  }, 0),
  hero({
    id: 'mock-myrr',
    name: 'Myrr',
    type: 'arcane mage',
    image: '/test/奥术法师.png',
    bp: 4520,
    hp: 1880,
    mp: 980,
    atk: 322,
    def: 28,
    cc: 21,
    ca: 18,
    pi: 12,
    speed: 96,
    typeCatalog: 'proj',
    typeEffect: 'magic',
    description: 'A glass-cannon mage for testing magic missiles and frost control impact.',
    skills: {
      s1: { name: 'Arcane Comet', description: 'Launches a violet comet that blooms on contact.', TYPE: 'magic', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'proj', type_effect: 'magic', DMG: '124', MP_COST: '30' },
      s2: { name: 'Frost Prism', description: 'Locks the target in a sudden burst of ice.', TYPE: 'frost', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'instant', type_effect: 'frost', buff_type_effect: 'frozen', BUFF_NAME: 'frozen', BUFF_TIME: '2', BUFF_EV: '-10', DMG: '62', MP_COST: '42' },
    },
    equippedRelicId: 'low_frost_shard',
  }, 1),
  hero({
    id: 'mock-kharos',
    name: 'Kharos',
    type: 'witchblade',
    image: '/test/巫术武士.png',
    bp: 5100,
    hp: 3020,
    mp: 640,
    atk: 338,
    def: 58,
    cc: 19,
    ca: 16,
    pi: 16,
    speed: 88,
    typeCatalog: 'instant',
    typeEffect: 'fire',
    description: 'A front-line spellblade built to test fire strikes and curse debuffs.',
    skills: {
      s1: { name: 'Witchflame Cut', description: 'Carves the target with a short-lived blade of fire.', TYPE: 'fire', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'melee', ROLE: 'attack', type_catalog: 'instant', type_effect: 'fire', DMG: '96', MP_COST: '26' },
      s2: { name: 'Corrupting Sigil', description: 'Brands the enemy and lowers their defenses.', TYPE: 'dark', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'instant', type_effect: 'dark', buff_type_effect: 'curse', BUFF_NAME: 'curse', BUFF_TIME: '3', BUFF_DEF: '-12', DMG: '44', MP_COST: '36' },
    },
    equippedRelicId: 'named_ashen_crown',
    enchantment: { relicId: 'named_ashen_crown', relicName: 'Ashen Crown', effectProfile: '+Fire authority, command traits', appliedAt: nowIso },
  }, 2),
  hero({
    id: 'mock-vera',
    name: 'Vera',
    type: 'gunsmoke ranger',
    image: '/test/枪火游侠.png',
    bp: 3980,
    hp: 1960,
    mp: 560,
    atk: 304,
    def: 34,
    cc: 28,
    ca: 22,
    pi: 20,
    speed: 128,
    typeCatalog: 'proj',
    typeEffect: 'bullet',
    description: 'A fast ranged striker for testing bullets, muzzle trails, and critical hits.',
    skills: {
      s1: { name: 'Deadeye Volley', description: 'Fires a rapid line of gunshots into one target.', TYPE: 'bullet', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'proj', type_effect: 'bullet', DMG: '78', MP_COST: '22' },
      s2: { name: 'Point Blank Execute', description: 'Steps in and detonates a close-range critical hit.', TYPE: 'gun', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'melee', ROLE: 'attack', type_catalog: 'instant', type_effect: 'bullet_hit', DMG: '148', MP_COST: '40' },
    },
  }, 3),
  hero({
    id: 'mock-sylwen',
    name: 'Sylwen',
    type: 'nature archer',
    image: '/test/自然射手.png',
    bp: 3860,
    hp: 2040,
    mp: 620,
    atk: 262,
    def: 36,
    cc: 20,
    ca: 14,
    pi: 13,
    speed: 116,
    typeCatalog: 'proj',
    typeEffect: 'nature',
    description: 'A tempo archer for testing green projectiles, poison marks, and wound feedback.',
    skills: {
      s1: { name: 'Briar Arrow', description: 'Sends a thorned arrow that leaves a bleeding wound.', TYPE: 'nature', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'proj', type_effect: 'nature', buff_type_effect: 'wound', BUFF_NAME: 'wound', BUFF_TIME: '2', BUFF_DMG: '42', DMG: '72', MP_COST: '24' },
      s2: { name: 'Venom Root', description: 'Poisons and weakens the target with crawling roots.', TYPE: 'poison', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'instant', type_effect: 'poison', buff_type_effect: 'curse', BUFF_NAME: 'curse', BUFF_TIME: '2', BUFF_DMG: '28', DMG: '38', MP_COST: '32' },
    },
  }, 4),
  hero({
    id: 'mock-odran',
    name: 'Odran',
    type: 'void warlock',
    image: '/test/虚空术士.png',
    bp: 4160,
    hp: 2320,
    mp: 940,
    atk: 286,
    def: 40,
    cc: 17,
    ca: 15,
    pi: 16,
    speed: 74,
    typeCatalog: 'proj',
    typeEffect: 'void',
    description: 'A curse specialist for testing void missiles and dark debuff persistence.',
    skills: {
      s1: { name: 'Null Lance', description: 'Throws a black lance that collapses into the target.', TYPE: 'void', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'proj', type_effect: 'void', DMG: '108', MP_COST: '28' },
      s2: { name: 'Grave Hex', description: 'Places a long curse that erodes enemy resistance.', TYPE: 'curse', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'instant', type_effect: 'dark', buff_type_effect: 'curse', BUFF_NAME: 'curse', BUFF_TIME: '3', BUFF_DEF: '-14', DMG: '50', MP_COST: '38' },
    },
    equippedRelicId: 'low_void_shard',
  }, 5),
  hero({
    id: 'mock-brakka',
    name: 'Brakka',
    type: 'bloodtusk chieftain',
    image: '/test/野蛮氏族.png',
    bp: 4720,
    hp: 3480,
    mp: 420,
    atk: 356,
    def: 66,
    cc: 22,
    ca: 20,
    pi: 18,
    ev: 6,
    speed: 72,
    typeCatalog: 'instant',
    typeEffect: 'claw',
    description: 'A bruiser used to test heavy flesh impacts, wounds, and party offense buffs.',
    skills: {
      s1: { name: 'Rending Claw', description: 'Tears through armor and leaves a visible wound.', TYPE: 'flesh', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'melee', ROLE: 'attack', type_catalog: 'instant', type_effect: 'claw', buff_type_effect: 'wound', BUFF_NAME: 'wound', BUFF_TIME: '2', BUFF_DMG: '54', DMG: '88', MP_COST: '24' },
      s2: { name: 'Blood Banner', description: 'Raises a brutal banner that empowers the next attacks.', TYPE: 'buff', TARGET: 'Self', TARGET_NUM: '1', RANGE: 'self', ROLE: 'buff', type_catalog: 'instant', type_effect: 'fire', buff_type_effect: 'pray', BUFF_NAME: 'pray', BUFF_TIME: '3', BUFF_DMG: '48', MP_COST: '30' },
    },
  }, 6),
  hero({
    id: 'mock-garran',
    name: 'Garran',
    type: 'iron knight',
    image: '/test/铁甲骑士.png',
    bp: 4880,
    hp: 3720,
    mp: 500,
    atk: 246,
    def: 92,
    cc: 14,
    ca: 12,
    pi: 14,
    ac: 12,
    speed: 64,
    typeCatalog: 'instant',
    typeEffect: 'strike',
    description: 'A defensive knight for testing weapon impacts, thunder strikes, and stun states.',
    skills: {
      s1: { name: 'Shieldbreaker Strike', description: 'Crushes the target with a blunt steel impact.', TYPE: 'weapon', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'melee', ROLE: 'attack', type_catalog: 'instant', type_effect: 'blunt', DMG: '84', MP_COST: '22' },
      s2: { name: 'Storm Oath', description: 'Calls a short thunder impact that can stun the target.', TYPE: 'thunder', TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'instant', type_effect: 'thunder', buff_type_effect: 'stun', BUFF_NAME: 'stun', BUFF_TIME: '1', IS_STUN: 'True', DMG: '56', MP_COST: '38' },
    },
    equippedRelicId: 'named_oath_lantern',
  }, 7),
];

export const mockEconomy: EconomySnapshot = {
  wallet: { user_id: 'mock-user', dust_balance: 8650, created_at: nowIso, updated_at: nowIso },
  relics: mockRelicInventory,
  relic_catalog: mockRelicCatalog,
  transactions: [],
  costs: {
    forge: 100,
    repair: 50,
    pve_entry: 20,
    pvp_entry: 30,
    pvp_revive: 200,
    pvp_stake: 30,
  },
  starter: {
    dust_balance: 8650,
  },
  pvp: {
    match_tolerance_pct: 10,
    low_tier_relic_drop_pct: 3,
    queue_ttl_minutes: 10,
  },
};
