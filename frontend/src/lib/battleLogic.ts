
import type { SavedHero } from '../types';
import type { BattleEvent, BattleResult } from './battleTypes';

const toInt = (value: string): number => Number.parseInt(value, 10) || 0;

export const runAutoDuel = (heroA: SavedHero, heroB: SavedHero, labelA: string = 'A', labelB: string = 'B'): BattleResult => {
  const hpAInit = Math.max(1, toInt(heroA.character.state.HP));
  const hpBInit = Math.max(1, toInt(heroB.character.state.HP));
  const mpAInit = Math.max(0, toInt(heroA.character.state.MP));
  const mpBInit = Math.max(0, toInt(heroB.character.state.MP));
  let hpA = hpAInit;
  let hpB = hpBInit;
  let mpA = mpAInit;
  let mpB = mpBInit;
  let stunnedA = 0;
  let stunnedB = 0;
  const events: BattleEvent[] = [];
  const logs: string[] = [];
  const maxRounds = 30;

  const pushEvent = (
    round: number,
    attackerTag: 'A' | 'B',
    actionType: 'attack' | 'skill' | 'stunned',
    damage: number,
    isCrit: boolean,
    isMiss: boolean,
    isStunned: boolean,
    skillName?: string,
    mpCostApplied: number = 0
  ) => {
    const defenderTag = attackerTag === 'A' ? 'B' : 'A';
    const log = `R${round} ${attackerTag} ${skillName ? `[${skillName}]` : '攻击'} -> ${damage}${isCrit ? ' (暴击)' : ''}${isStunned ? ' (眩晕)' : ''}${isMiss ? ' (未命中)' : ''}`;
    logs.push(log);

    events.push({
      round,
      attacker: attackerTag,
      defender: defenderTag,
      actionType,
      skillName,
      damage,
      isCrit,
      isMiss,
      isStunned,
      hpA,
      hpB,
      mpA,
      mpB,
      maxHpA: hpAInit,
      maxHpB: hpBInit,
      maxMpA: mpAInit,
      maxMpB: mpBInit,
      mpCostApplied,
      log,
      timestamp: Date.now(),
    });
  };

  const attack = (attacker: SavedHero, defender: SavedHero, hp: number, isDefenderStunned: number, round: number, attackerTag: 'A' | 'B') => {
    const ATK = Math.max(1, toInt(attacker.character.state.ATK));
    const DEF = Math.min(80, Math.max(0, toInt(defender.character.state.DEF)));
    const CC = Math.min(100, Math.max(0, toInt(attacker.character.state.CC)));
    const CA = Math.min(100, Math.max(0, toInt(attacker.character.state.CA)));
    const AC = Math.min(50, Math.max(0, toInt(attacker.character.state.AC)));
    const EV = Math.min(50, Math.max(0, toInt(defender.character.state.EV)));
    const PI = Math.min(80, Math.max(0, toInt(attacker.character.state.PI)));

    const attackerMp = attackerTag === 'A' ? mpA : mpB;
    const useSkill = round % 2 === 0;
    const plannedSkill = useSkill ? (round % 4 === 0 ? attacker.character.skill.s2 : attacker.character.skill.s1) : null;
    const plannedSkillCost = plannedSkill ? Math.max(0, toInt(plannedSkill.MP_COST)) : 0;
    const chosenSkill = plannedSkill && attackerMp >= plannedSkillCost ? plannedSkill : null;
    const skillCost = chosenSkill ? plannedSkillCost : 0;
    const skillDamage = chosenSkill ? Math.max(0, toInt(chosenSkill.DMG)) : 0;
    const hitChance = Math.max(0.2, Math.min(1.5, 1 + (AC - EV) / 100));
    const nextAttackerMp = Math.max(0, attackerMp - skillCost);

    if (attackerTag === 'A') mpA = nextAttackerMp;
    else mpB = nextAttackerMp;

    if (Math.random() > hitChance) {
      pushEvent(round, attackerTag, chosenSkill ? 'skill' : 'attack', 0, false, true, false, chosenSkill?.name, skillCost);
      return { hp, stunned: isDefenderStunned };
    }

    const isCrit = Math.random() < CC / 100;
    const critMultiplier = isCrit ? 1 + CA / 100 : 1;
    const mitigation = Math.max(0, (DEF - PI * 0.5) / 100);
    const rawDamage = (ATK + skillDamage) * critMultiplier;
    const damage = Math.max(1, Math.floor(rawDamage * (1 - mitigation)));
    const nextHp = Math.max(0, hp - damage);
    const nextStunned = chosenSkill?.IS_STUN === 'True' ? 1 : isDefenderStunned;

    if (attackerTag === 'A') hpB = nextHp;
    else hpA = nextHp;

    pushEvent(round, attackerTag, chosenSkill ? 'skill' : 'attack', damage, isCrit, false, nextStunned > isDefenderStunned, chosenSkill?.name, skillCost);

    return { hp: nextHp, stunned: nextStunned };
  };

  for (let round = 1; round <= maxRounds && hpA > 0 && hpB > 0; round += 1) {
    const speedA = toInt(heroA.character.state.SPEED);
    const speedB = toInt(heroB.character.state.SPEED);
    const aFirst = speedA === speedB ? Math.random() > 0.5 : speedA > speedB;

    const stepA = () => {
      if (stunnedA > 0) {
        stunnedA -= 1;
        pushEvent(round, 'A', 'stunned', 0, false, false, false);
        return;
      }
      const result = attack(heroA, heroB, hpB, stunnedB, round, 'A');
      hpB = result.hp;
      stunnedB = result.stunned;
    };

    const stepB = () => {
      if (stunnedB > 0) {
        stunnedB -= 1;
        pushEvent(round, 'B', 'stunned', 0, false, false, false);
        return;
      }
      const result = attack(heroB, heroA, hpA, stunnedA, round, 'B');
      hpA = result.hp;
      stunnedA = result.stunned;
    };

    if (aFirst) {
      stepA();
      if (hpB > 0) stepB();
    } else {
      stepB();
      if (hpA > 0) stepA();
    }
  }

  let winner = heroA.character.name;
  if (hpA === hpB) winner = '平局';
  else if (hpA < hpB) winner = heroB.character.name;

  logs.push(`战斗结束：${winner}`);

  return {
    winner,
    winnerLabel: winner === heroA.character.name ? labelA : (winner === heroB.character.name ? labelB : '平局'),
    logs,
    events,
    finalHpA: hpA,
    finalHpB: hpB,
    maxHpA: hpAInit,
    maxHpB: hpBInit,
  };
};

export const runTeamDuel = (teamA: SavedHero[], teamB: SavedHero[], size: '1v1' | '3v3', labelA: string, labelB: string): { winnerLabel: string; summary: string; logs: string[]; events: BattleEvent[]; details: BattleResult | null } => {
  if (size === '1v1') {
    const result = runAutoDuel(teamA[0], teamB[0], labelA, labelB);
    return {
      winnerLabel: result.winnerLabel,
      summary: `${labelA} vs ${labelB}（1v1）胜者：${result.winnerLabel}`,
      logs: result.logs,
      events: result.events, // Pass events through
      details: result // Already matches BattleResult
    };
  }

  // 3v3 Logic - Simplified for now to just return logs, but we should ideally chain events
  // For now, let's just focus on 1v1 as requested.
  // But to be safe, I'll implement a basic loop.

  let winsA = 0;
  let winsB = 0;
  const logs: string[] = [];
  const allEvents: BattleEvent[] = []; // We might want to show all fights

  for (let index = 0; index < 3; index += 1) {
    const heroA = teamA[index];
    const heroB = teamB[index];
    if (!heroA || !heroB) continue;

    // Add a divider event? Or just concatenate
    const duelResult = runAutoDuel(heroA, heroB, labelA, labelB);

    if (duelResult.winner === heroA.character.name) winsA += 1;
    else if (duelResult.winner === heroB.character.name) winsB += 1;

    logs.push(`--- 第${index + 1}场 ---`);
    logs.push(...duelResult.logs);

    // Adjust rounds for subsequent fights so they don't overlap in a timeline view if we merge them
    // For now, we just push them. The visualizer might need to handle "Scene Change"
    allEvents.push(...duelResult.events.map(e => ({ ...e, round: e.round + index * 100 })));
  }

  const winnerLabel = winsA === winsB ? '平局' : winsA > winsB ? labelA : labelB;
  logs.push(`团队比分 ${labelA} ${winsA}:${winsB} ${labelB}`);
  logs.push(`战斗结束：${winnerLabel}`);

  return {
    winnerLabel,
    summary: `${labelA} vs ${labelB}（3v3）比分 ${winsA}:${winsB}，胜者：${winnerLabel}`,
    logs,
    events: allEvents,
    details: null,
  };
};
