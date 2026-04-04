import type { BattleResult } from './battleTypes';
import type { CharacterData } from './gameLogic';
import { battleHeroes, battleTeams, getStoredToken } from './api';

export async function runBackendDuel(heroA: CharacterData, heroB: CharacterData, token: string | null = getStoredToken()): Promise<BattleResult> {
  return await battleHeroes(heroA, heroB, token);
}

export async function runBackendTeamDuel(
  teamA: CharacterData[],
  teamB: CharacterData[],
  size: '1v1' | '3v3' | '4v4',
  labelA: string,
  labelB: string,
  token: string | null = getStoredToken()
): Promise<BattleResult> {
  return await battleTeams(teamA, teamB, size, labelA, labelB, token);
}

export const runAutoDuel = runBackendDuel;
export const runTeamDuel = runBackendTeamDuel;
