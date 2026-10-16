import type { BattleSessionAction, BattleSessionSnapshot } from '../types';
import type { CharacterData } from './gameLogic';
import type { BattleResult, BattleBoardState } from './battleTypes';
import { gameArtUrl } from './artAssets';

export type PveTier = 'adaptive' | 'threshold' | 'reflection' | 'heart';
export type PveEncounterPreview = { tier: string; node: string; variant: string; enemyTotalBp: number; enemies: Array<{ name: string; role: string; slot: number }> };
export type PveDepth = { id: string; name: string; recommended_team_bp: number; minimum_team_bp?: number; honor_bp_band: number[]; ratios?: number[]; scaling?: string };
export type PveCreature = { id: string; name: string; role: string; lore: string; tactic: string };
export type PveIntent = { actorTag: string; name: string; action: string; targetTags: string[]; targetCount?: number; damageMultiplier?: number; curse?: boolean; interruptible: boolean };
export type PveRewardChoice = { id: string; name: string; description: string };
export type PveCatalog = { name: string; theme: string; contentVersion: string; prototype: boolean; entryCost: number; rewardPolicy: string;
  bestiary: PveCreature[];
  rewards?: PveRewardChoice[]; firstClearDust?: Record<string, number>;
  minimumTeamBp?: number; legacyTiers?: PveDepth[];
  tiers: PveDepth[];
  nodes: Array<{ id: string; name: string; kind: string; variants?: string[]; next: string[] }>;
  encounters?: PveEncounterPreview[] };
export type PveRun = { id: string; tier: PveTier; teamBp: number; revision: number; status: 'active' | 'failed' | 'completed' | 'abandoned';
  node: number; furthestNode: number; checkpointNode: number; clearedNodes: number[]; branches: Record<string, string>; honorEligible: boolean;
  retries: number; totalRounds: number; boon: boolean; resources: Record<string, { hp: number; mp: number }>;
  party: Array<{ id: string; slot: number; character: CharacterData; image?: string | null }>;
  reward: { firstClear: boolean; dust: number; message: string } | null;
  lumens?: number; relics?: Record<string, number>; pendingReward?: { floor: number; lumens: number; choices: PveRewardChoice[] } | null;
  rewardHistory?: Array<{ floor: number; kind: string; name: string }>; legacy?: boolean;
  entryPowerBp?: number | null; entryPartySize?: number | null;
  nextEncounter?: PveEncounterPreview; encounterChoices?: Record<string, PveEncounterPreview>;
  battleSession: (BattleSessionSnapshot & { intents: PveIntent[]; npcRoles?: Record<string, string> }) | null };
export type PveOperation = 'enter' | 'confirm' | 'camp' | 'retry' | 'abandon' | 'action' | 'advance' | 'reward' | 'event' | 'shop';
export type PveInput = { branch?: string; choice?: string; reviveHeroId?: string; action?: BattleSessionAction; positions?: Record<string, number> };

export function pveBpEligibility(teamBp: number, count: number) {
  return { minimum: 1000, eligible: Number.isSafeInteger(teamBp) && Number.isInteger(count) && count >= 1 && count <= 4 && teamBp >= 1000 };
}

export function pveBattleResult(run: PveRun, creatures: PveCreature[] = []): BattleResult | null {
  const room = run.battleSession;
  if (!room?.board) return null;
  const portraits = new Map(run.party.map(hero => [hero.slot, hero.image]));
  const names = new Map(creatures.map(creature => [creature.id, creature.name]));
  const enrich = (board: BattleBoardState): BattleBoardState => ({ ...board, topLabel: 'Void Labyrinth', bottomLabel: 'Expedition',
    bottom: board.bottom.map(unit => unit ? { ...unit, image: gameArtUrl(portraits.get(unit.slot) ?? unit.image) } : null),
    top: board.top.map(unit => {
      if (!unit) return null;
      const role = room.npcRoles?.[unit.tag];
      return { ...unit, name: role ? names.get(role) ?? unit.name : unit.name, image: gameArtUrl(role ? `/art/void-labyrinth/${role}-v2.webp` : unit.image) };
    }),
  });
  const hp = (side: 'bottom' | 'top', key: 'hp' | 'maxHp' | 'maxMp') => room.board![side].reduce((sum, unit) => sum + (unit?.[key] ?? 0), 0);
  const result = room.result ?? { winner: 'Pending', events: room.events ?? [], logs: room.logs ?? [],
    finalHpA: hp('bottom', 'hp'), finalHpB: hp('top', 'hp'), maxHpA: hp('bottom', 'maxHp'), maxHpB: hp('top', 'maxHp'),
    maxMpA: hp('bottom', 'maxMp'), maxMpB: hp('top', 'maxMp') };
  return { ...result, board: enrich(room.result?.board ?? room.board),
    boardHistory: (room.result?.boardHistory ?? room.boardHistory ?? []).map(enrich) };
}
