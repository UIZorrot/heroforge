export interface BuffState {
  name: string;
  duration: number;
  value: number;
  effects?: Record<string, number>;
}

export type BattleBoardSkill = Partial<import('./gameLogic').Skill>;

export type BattleActionOption = { kind: 'attack' | 'skill' | 'wait'; skillSlot?: 's1' | 's2'; name: string; cost: number; targets: string[]; disabled?: string | null };

export interface BattleEvent {
  /** Contiguous per-target results of one cast; absent on legacy replays. */
  actionId?: string | null;
  targetIndex?: number;
  targetCount?: number;
  vfxPresentation?: 'auto' | 'instant' | 'sky' | 'direct' | null;
  round: number;
  attacker: string;
  defender: string;
  attackerSlot?: number | null;
  defenderSlot?: number | null;
  actionType: 'attack' | 'skill' | 'stunned' | 'dot_damage' | 'heal';
  skillName?: string;
  attackType?: string | null;
  buffName?: string | null;
  typeCatalog?: string | null;
  typeEffect?: string | null;
  buffTypeEffect?: string | null;
  type_catalog?: string | null;
  type_effect?: string | null;
  buff_type_effect?: string | null;
  skillRole?: string | null;
  rangeMode?: string | null;
  vfxAngleOffsetDeg?: number | null;
  vfx_angle_offset_deg?: number | null;
  damage: number;
  heal: number;
  isCrit: boolean;
  isMiss: boolean;
  isStunned: boolean;
  hpA: number;
  hpB: number;
  mpA: number;
  mpB: number;
  maxHpA: number;
  maxHpB: number;
  maxMpA: number;
  maxMpB: number;
  buffsA: BuffState[];
  buffsB: BuffState[];
  mpCostApplied: number;
  log: string;
  timestamp: number;
}

export interface BattleBoardUnit {
  tag: string;
  side: 'A' | 'B';
  slot: number;
  name: string;
  image?: string | null;
  alive: boolean;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  buffs: BuffState[];
  skills?: Record<string, BattleBoardSkill | undefined>;
  state?: Record<string, string | number> & {
    TYPE?: string;
    type_catalog?: string;
    type_effect?: string;
  };
}

export interface BattleBoardState {
  round: number;
  riverLabel: string;
  topLabel: string;
  bottomLabel: string;
  top: Array<BattleBoardUnit | null>;
  bottom: Array<BattleBoardUnit | null>;
}

export interface BattleResult {
  winner: string;
  winnerLabel?: string;
  logs: string[];
  events: BattleEvent[];
  board?: BattleBoardState;
  boardHistory?: BattleBoardState[];
  finalHpA?: number;
  finalHpB?: number;
  maxHpA?: number;
  maxHpB?: number;
  maxMpA?: number;
  maxMpB?: number;
  aliveA?: number;
  aliveB?: number;
  summary?: string;
  details?: BattleResult | null;
}
