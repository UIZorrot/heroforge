
export interface BattleEvent {
  round: number;
  attacker: 'A' | 'B';
  defender: 'A' | 'B';
  actionType: 'attack' | 'skill' | 'stunned';
  skillName?: string;
  damage: number;
  isCrit: boolean;
  isMiss: boolean;
  isStunned: boolean; // The result of this action causing a stun
  hpA: number; // HP after the event
  hpB: number; // HP after the event
  mpA: number; // MP after the event
  mpB: number; // MP after the event
  maxHpA: number;
  maxHpB: number;
  maxMpA: number;
  maxMpB: number;
  mpCostApplied: number;
  log: string;
  timestamp: number;
}

export interface BattleResult {
  winner: string; // Name of the winner
  winnerLabel: string; // Label (e.g. "My Team")
  logs: string[];
  events: BattleEvent[];
  finalHpA: number;
  finalHpB: number;
  maxHpA: number;
  maxHpB: number;
}
