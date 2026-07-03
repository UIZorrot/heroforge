import type { BattleEvent, BattleResult } from './lib/battleTypes';
import type { CharacterData } from './lib/gameLogic';

export type { BattleEvent, BattleResult } from './lib/battleTypes';
export type { CharacterData } from './lib/gameLogic';

export type SectionKey = 'home' | 'forge' | 'vault' | 'arena' | 'chronicle' | 'market';

export type MaterialKey = 'glowGem' | 'chaosMind' | 'emberCore' | 'frostShard' | 'stormSigil' | 'voidDust';
export type MaterialInventory = Record<MaterialKey, number>;
export type CardPvpLifeState = 'active' | 'pvp_dead';
export type CardPveLifeState = 'active' | 'pve_injured';
export type CardStatus = 'active' | 'locked' | 'decomposed';
export type ArenaSlotKey = 'front_0' | 'front_1' | 'front_2' | 'back_0' | 'back_1' | 'back_2';
export type ArenaFormation = Record<ArenaSlotKey, string | null>;

export interface MaterialDefinition {
  key: MaterialKey;
  label: string;
  effect: string;
  rewardTag: string;
  overlayClass: string;
  particleClass: string;
  badgeClass: string;
}

export interface AuthUser {
  id: string;
  email: string;
  session_id?: string;
  expires_at?: string;
}

export interface LoginCodeResponse {
  email: string;
  expires_at: string;
  id: string;
}

export interface VerifyLoginResponse {
  token: string;
  session_id: string;
  expires_at: string;
  user: AuthUser;
}

export interface SavedHero {
  id: string;
  createdAt: number;
  image?: string;
  character: CharacterData;
  infusedMaterials?: Partial<MaterialInventory>;
  equippedRelicId?: string | null;
  enchantment?: {
    relicId: string;
    relicName: string;
    effectProfile?: string;
    appliedAt: string;
    removedAt?: string | null;
  } | null;
  pvpLifeState?: CardPvpLifeState;
  pveLifeState?: CardPveLifeState;
  cardStatus?: CardStatus;
  lockedReason?: string | null;
  pvpDeadAt?: string | null;
  decomposedAt?: string | null;
  activePvpEntryId?: string | null;
}

export interface HeroHistoryRecord {
  id: string;
  created_at: string;
  hero_payload: CharacterData;
  source_payload?: unknown;
  equipped_relic_type?: string | null;
  enchantment?: {
    relicType?: string;
    relicName?: string;
    effectProfile?: string;
    appliedAt?: string;
    removedAt?: string | null;
    relicId?: string;
    relicNameLegacy?: string;
    effect_profile?: string;
    applied_at?: string;
    removed_at?: string | null;
  } | null;
  pvp_life_state: CardPvpLifeState;
  pve_life_state: CardPveLifeState;
  card_status: CardStatus;
  locked_reason?: string | null;
  pvp_dead_at?: string | null;
  decomposed_at?: string | null;
  active_pvp_entry_id?: string | null;
}

export interface BattleHistoryRecord {
  id: string;
  created_at: string;
  battle_type: string;
  payload?: unknown;
  result: BattleResult;
}

export interface EconomyTransaction {
  id: string;
  resource_type: 'dust' | 'relic';
  resource_key?: string | null;
  delta: number;
  balance_after?: number | null;
  reason: string;
  ref_type?: string | null;
  ref_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface RelicDefinition {
  relic_type: string;
  display_name: string;
  tier: 'common' | 'rare' | 'epic' | 'legendary' | 'limited';
  family: string;
  lore_summary: string;
  effect_profile: string;
  forge_bias: string;
  battle_bias: string;
  icon_prompt: string;
  is_limited: boolean;
}

export interface EconomySnapshot {
  wallet: {
    user_id: string;
    dust_balance: number;
    created_at: string;
    updated_at: string;
  } | null;
  relics: Array<{
    user_id: string;
    relic_type: string;
    amount: number;
    created_at: string;
    updated_at: string;
  }>;
  relic_catalog: RelicDefinition[];
  transactions: EconomyTransaction[];
  costs: {
    forge: number;
    repair: number;
    pve_entry: number;
    pvp_entry: number;
    pvp_revive: number;
    pvp_stake: number;
  };
  starter: {
    dust_balance: number;
  };
  pvp: {
    match_tolerance_pct: number;
    low_tier_relic_drop_pct: number;
    queue_ttl_minutes: number;
  };
}

export interface DailyTask {
  id: string;
  key: string;
  title: string;
  description: string;
  task_date: string;
  progress: number;
  target: number;
  reward_dust: number;
  claimed: boolean;
  claimable: boolean;
  claimed_at?: string | null;
}

export interface DailySnapshot {
  date: string;
  checkin: {
    claimed: boolean;
    claim_date: string;
    reward_dust: number;
    claimed_at?: string | null;
  };
  tasks: DailyTask[];
  economy: EconomySnapshot;
}

export interface LadderSnapshot {
  rating: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Mythic' | string;
  record: {
    played: number;
    wins: number;
    losses: number;
    ties: number;
  };
  win_rate: number;
  rules: {
    base_rating: number;
    win_delta: number;
    tie_delta: number;
    loss_delta: number;
    source: string;
  };
  recent_matches: Array<{
    id: string;
    queue_key: string;
    result: 'win' | 'loss' | 'tie';
    rating_delta: number;
    opponent_user_id: string;
    bp: number;
    opponent_bp: number;
    stake_dust: number;
    resolved_at?: string | null;
    created_at?: string | null;
  }>;
}

export interface SessionSnapshot {
  token: string;
  email: string;
  expiresAt?: string;
}

export interface ClientBattleSummary {
  winner: string;
  winnerLabel?: string;
  logs: string[];
  events: BattleEvent[];
  finalHpA?: number;
  finalHpB?: number;
  maxHpA?: number;
  maxHpB?: number;
  summary?: string;
  details?: BattleResult | null;
}

export type PvpQueueStatus = 'waiting' | 'matched' | 'cancelled' | 'expired';
export type PvpBattleMode = '1v1' | '4v4' | 'arena_2x3';

export interface BattleSessionUnit {
  tag: string;
  side: 'A' | 'B';
  slot: number;
  name: string;
  alive: boolean;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  buffs: BattleEvent['buffsA'];
  state?: Record<string, string | number> & {
    TYPE?: string;
  };
  skills?: Record<string, Record<string, unknown> | undefined>;
}

export interface BattleSessionObservation {
  round: number;
  labels: {
    a: string;
    b: string;
  };
  actor: BattleSessionUnit;
  allies: BattleSessionUnit[];
  enemies: BattleSessionUnit[];
}

export interface BattleSessionSnapshot {
  sessionId: string;
  battleMode: PvpBattleMode;
  controlMode: 'rest';
  labelA: string;
  labelB: string;
  status: 'awaiting_action' | 'resolved';
  round: number;
  waitingUntil?: number | null;
  waitSeconds: number;
  activeActorTag?: string | null;
  expectedActionSource?: string | null;
  lastActionSource?: string | null;
  lastAction?: Record<string, unknown> | null;
  observation?: BattleSessionObservation | BattleResult['board'] | null;
  result?: BattleResult | null;
}

export interface BattleSessionAction {
  actorTag: string;
  kind: 'attack' | 'skill';
  targetTag?: string | null;
  skillSlot?: 's1' | 's2' | null;
}

export interface PvpTeamSnapshot {
  hero_ids: string[];
  team: Array<{
    id: string;
    hero_payload: CharacterData;
    created_at: string;
  }>;
  total_bp: number;
}

export interface ArenaFormationSnapshot {
  mode: 'arena_2x3';
  board: ArenaFormation;
}

export interface PvpQueueEntry {
  id: string;
  user_id: string;
  queue_key: string;
  battle_mode: PvpBattleMode;
  stake_dust: number;
  bp_value: number;
  status: PvpQueueStatus;
  team_snapshot: PvpTeamSnapshot;
  formation_snapshot?: ArenaFormationSnapshot | Record<string, unknown>;
  opponent_entry_id?: string | null;
  match_id?: string | null;
  expires_at: string;
  matched_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
}

export interface PvpMatchRecord {
  id: string;
  queue_key: string;
  battle_mode: PvpBattleMode;
  entry_a_id: string;
  entry_b_id: string;
  user_a_id: string;
  user_b_id: string;
  stake_dust: number;
  bp_a: number;
  bp_b: number;
  bp_gap_pct: number;
  status: 'created' | 'running' | 'resolved' | 'failed' | 'cancelled';
  battle_payload?: Record<string, unknown>;
  battle_result?: BattleResult | null;
  formation_a?: ArenaFormationSnapshot | Record<string, unknown>;
  formation_b?: ArenaFormationSnapshot | Record<string, unknown>;
  reward_payload?: Record<string, unknown>;
  card_state_changes?: Array<Record<string, unknown>>;
  battle_id?: string | null;
  winner_user_id?: string | null;
  winner_side?: 'A' | 'B' | 'Tie' | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface PvpJoinResponse {
  status: 'waiting' | 'matched';
  entry: PvpQueueEntry;
  opponent?: PvpQueueEntry | null;
  match?: PvpMatchRecord | null;
  battle?: BattleResult | null;
  battle_record_a?: BattleHistoryRecord | null;
  battle_record_b?: BattleHistoryRecord | null;
  battle_payload?: Record<string, unknown> | null;
  reward?: Record<string, unknown> | null;
  card_state_changes?: Array<Record<string, unknown>>;
  economy: EconomySnapshot;
  winner_side?: 'A' | 'B' | 'Tie' | null;
}

export interface PvpEntryStatusResponse {
  ok: boolean;
  entry: PvpQueueEntry;
  match?: PvpMatchRecord | null;
}
