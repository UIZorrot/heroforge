import type { BattleEvent, BattleResult } from './lib/battleTypes';
import type { CharacterData } from './lib/gameLogic';

export type { BattleEvent, BattleResult } from './lib/battleTypes';
export type { CharacterData } from './lib/gameLogic';

export type SectionKey = 'home' | 'forge' | 'vault' | 'duel' | 'arena' | 'profile';

export type MaterialKey = 'glowGem' | 'chaosMind' | 'emberCore' | 'frostShard' | 'stormSigil' | 'voidDust';
export type MaterialInventory = Record<MaterialKey, number>;

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
}

export interface HeroHistoryRecord {
  id: string;
  created_at: string;
  hero_payload: CharacterData;
  source_payload?: unknown;
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
  transactions: EconomyTransaction[];
  costs: {
    forge: number;
    repair: number;
    pve_entry: number;
    pvp_entry: number;
    pvp_stake: number;
  };
  starter: {
    dust_balance: number;
  };
  pvp: {
    match_tolerance_pct: number;
    queue_ttl_minutes: number;
  };
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
export type PvpBattleMode = '1v1' | '4v4';

export interface PvpTeamSnapshot {
  hero_ids: string[];
  team: Array<{
    id: string;
    hero_payload: CharacterData;
    created_at: string;
  }>;
  total_bp: number;
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
  economy: EconomySnapshot;
  winner_side?: 'A' | 'B' | 'Tie' | null;
}

export interface PvpEntryStatusResponse {
  ok: boolean;
  entry: PvpQueueEntry;
  match?: PvpMatchRecord | null;
}
