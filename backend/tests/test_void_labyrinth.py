import copy
import json
import random
from pathlib import Path

import pytest
import battle_logic
from battle_sessions import BattleSessionError
from pve_battle import LabyrinthBattle
from pve_content import CONTENT, TIERS, VERSION, catalog, encounter_for, enemy_hero
from pve_runs import new_run, transition, public_run, party_with_relics
from test_battle_sessions_program import _hero


def party(powerful=False, team_bp=1000):
    heroes = []
    for index in range(4):
        character = _hero(f'Explorer {index}', 200)
        character['BP'] = str(team_bp // 4)
        character['state'].update(HP='100000' if powerful else '1000', ATK='100000' if powerful else '12', TYPE='Ranged')
        heroes.append({'id': f'hero-{index}', 'slot': index, 'character': character})
    return heroes


def room(tier='threshold', node='N10'):
    heroes = party()
    resources = {hero['id']: {'hp': int(hero['character']['state']['HP']), 'mp': 100} for hero in heroes}
    return LabyrinthBattle(encounter_for(tier, node), heroes, resources, 42)


def set_actor(battle, actor):
    battle.turn_order = [actor]
    battle.turn_index = 0
    battle.status = 'awaiting_action'
    battle._refresh_observation()


@pytest.mark.parametrize('encounter', CONTENT['encounters'], ids=lambda e: e['id'])
def test_fixed_enemy_budgets_and_slots(encounter):
    enemies = [enemy_hero(entry, encounter['enemy_total_bp']) for entry in encounter['enemies']]
    assert len(enemies) <= 6 and len({hero['slot'] for hero in enemies}) == len(enemies)
    assert sum(int(hero['character']['BP']) for hero in enemies) == encounter['enemy_total_bp']
    for hero in enemies:
        state = hero['character']['state']
        assert sum(state[key] * cost for key, cost in CONTENT['stat_costs'].items()) == hero['character']['BP']


def test_front_column_protection_and_empty_column_access():
    battle = room('heart')
    actor = battle.team_a_units[0]
    actor.character['state']['TYPE'] = 'Melee'
    tags = {unit.slot_index for unit in battle._manual_targets(actor, None)}
    assert tags == {0, 1, 2}
    battle.team_b_units[0].hp = 0
    assert 3 in {unit.slot_index for unit in battle._manual_targets(actor, None)}
    assert 5 not in {unit.slot_index for unit in battle._manual_targets(actor, None)}


def test_wait_limit_rejects_without_recovery_or_progress():
    battle = room()
    actor = battle.team_a_units[0]
    actor.hp = 400
    for _ in range(2):
        set_actor(battle, actor)
        battle.submit_action({'actorTag': actor.tag, 'kind': 'wait', 'expectedEventCount': len(battle.events)})
    set_actor(battle, actor)
    hp, event_count = actor.hp, len(battle.events)
    with pytest.raises(BattleSessionError):
        battle.submit_action({'actorTag': actor.tag, 'kind': 'wait', 'expectedEventCount': event_count})
    assert (actor.hp, len(battle.events)) == (hp, event_count)
    assert battle.public_snapshot()['actionOptions'][-1]['disabled']


def test_round_limit_cannot_be_won_by_hp_sum():
    battle = room()
    for actor in battle.team_a_units:
        if actor:
            actor.hp = actor.max_hp = 100000
    battle.round = 31
    battle._begin_round(0)
    assert battle.status == 'resolved'
    assert not battle.result['cleared'] and battle.result['reason'] == 'round_limit'


def test_anchor_break_reduces_locked_targets_and_pays_mp_once():
    battle = room('heart')
    boss = battle.team_b_units[1]
    battle.npc_phases[boss.tag] = 1
    set_actor(battle, boss)
    battle.step_enemy()
    assert len(battle.pending_marks[boss.tag]) == 4
    battle.team_b_units[3].hp = 0
    assert len(battle._ritual_targets(boss)) == 2
    before = boss.mp
    set_actor(battle, boss)
    start = len(battle.events)
    battle.step_enemy()
    hits = [event for event in battle.events[start:] if event['actionType'] == 'skill']
    assert len(hits) == 2 and len({event['actionId'] for event in hits}) == 1
    assert sum(event['mpCostApplied'] for event in hits) == before - boss.mp > 0


def test_stun_and_insufficient_mp_cancel_ritual():
    for cause in ('stun', 'mp'):
        battle = room()
        boss = battle.team_b_units[1]
        battle.npc_phases[boss.tag] = 2
        battle.pending_marks[boss.tag] = ['A1']
        if cause == 'stun':
            boss.add_buff('stun', 1, 0, battle.logs)
        else:
            boss.mp = 0
        set_actor(battle, boss)
        hp = battle.team_a_units[0].hp
        battle.step_enemy()
        assert battle.team_a_units[0].hp == hp
        assert boss.tag not in battle.pending_marks and battle.npc_phases[boss.tag] == 3


def test_boss_death_collapses_anchors_but_live_guard_prevents_clear():
    battle = room('heart')
    battle.team_b_units[1].hp = 0
    battle._advance_turn_or_round()
    assert battle.team_b_units[3].hp == battle.team_b_units[5].hp == 0
    assert battle.status != 'resolved'


def test_restore_keeps_rng_pending_targets_and_resource_costs():
    original = room('heart')
    boss = original.team_b_units[1]
    original.npc_phases[boss.tag] = 2
    original.pending_marks[boss.tag] = ['A1', 'A2', 'A3', 'A4']
    set_actor(original, boss)
    restored = LabyrinthBattle.restore(json.loads(json.dumps(original.export_state())))
    original.step_enemy()
    restored.step_enemy()
    assert original.public_snapshot()['board'] == restored.public_snapshot()['board']
    assert original.rng.getstate() == restored.rng.getstate()
    assert [(e['damage'], e['isMiss'], e['mpCostApplied']) for e in original.events] == [(e['damage'], e['isMiss'], e['mpCostApplied']) for e in restored.events]


def test_ritual_curse_survives_next_round_and_does_not_replace_dead_marks():
    battle = room('heart')
    boss = battle.team_b_units[1]
    battle.npc_phases[boss.tag] = 2
    battle.pending_marks[boss.tag] = ['A1', 'A2', 'A3', 'A4']
    battle.team_b_units[3].hp = 0
    battle.team_a_units[0].hp = 0
    assert [unit.tag for unit in battle._ritual_targets(boss)] == ['A2']
    set_actor(battle, boss)
    battle.step_enemy()
    assert battle.round == 2
    cursed = battle.team_a_units[1]
    assert any(buff['name'] == 'curse' and buff['duration'] == 1 for buff in cursed.buffs)
    assert not battle.team_a_units[2].buffs


def test_six_active_scripted_enemies_each_take_their_turn():
    battle = room('heart', 'N7')
    enemies = [unit for unit in battle.team_b_units if unit]
    for actor in enemies:
        set_actor(battle, actor)
        battle.step_enemy()
    assert {event['attacker'] for event in battle.events if event['actionType'] == 'attack'} == {unit.tag for unit in enemies}


def test_campaign_rng_does_not_change_other_battles_random_source():
    random.seed(42)
    state = random.getstate()
    battle = room()
    actor = battle.team_a_units[0]
    set_actor(battle, actor)
    battle.submit_action({'actorTag': actor.tag, 'kind': 'attack', 'targetTag': 'B1', 'expectedEventCount': 0})
    assert random.getstate() == state
    assert battle_logic.battle_random() is random


def test_mock_preview_catalog_matches_runtime_map_and_tiers():
    path = Path(__file__).resolve().parents[2] / 'frontend/src/lib/pvePreviewCatalog.ts'
    preview = json.loads(path.read_text(encoding='utf-8').split('= ', 1)[1].strip().removesuffix(';'))
    assert preview['tiers'] == catalog()['tiers']
    assert preview['legacyTiers'] == CONTENT['tiers']
    assert preview['nodes'] == CONTENT['nodes']
    assert preview['contentVersion'] == VERSION
    assert {creature['id'] for creature in preview['bestiary']} == set(CONTENT['archetypes'])
    assets = path.parents[2] / 'public/art/void-labyrinth'
    for creature in preview['bestiary']:
        assert creature['name'] == CONTENT['archetypes'][creature['id']]['name']
        assert creature['lore'] and creature['tactic']
        assert (assets / f"{creature['id']}-v2.webp").is_file()
    assert (assets / 'environment-v2.webp').is_file()


def test_old_saved_npc_presentation_refresh_preserves_combat_and_player_content():
    battle = room()
    saved = battle.export_state()
    saved['units_a'][0]['name'] = '玩家的名字'
    for unit in saved['units_b']:
        if unit:
            unit['name'] = unit['character']['name'] = '旧怪物名字'
            for skill in unit['character'].get('skill', {}).values():
                skill['name'] = '旧技能'
    original = copy.deepcopy(saved)
    restored = LabyrinthBattle.restore(saved)
    assert saved == original
    assert restored.team_a_units[0].name == '玩家的名字'
    for unit, previous in zip(restored.team_b_units, original['units_b']):
        if unit:
            assert unit.name == CONTENT['archetypes'][unit.hero['npcRole']]['name']
            assert (unit.hp, unit.mp) == (previous['hp'], previous['mp'])
            assert unit.character['state'] == previous['character']['state']
            assert vars(unit)['buffs'] == previous['buffs']
            for key, skill in unit.character.get('skill', {}).items():
                assert skill['name'] != '旧技能'
                assert skill['MP_COST'] == previous['character']['skill'][key]['MP_COST']
    assert restored.rng.getstate() == battle.rng.getstate()
    assert restored.pending_marks == battle.pending_marks


def test_camp_checkpoint_revival_and_single_use():
    run = new_run('threshold', party(), 123)
    run['node'] = 4
    run['resources']['hero-0'].update(hp=0, mp=0)
    transition(run, 'camp', {'choice': 'rest', 'reviveHeroId': 'hero-0'})
    assert run['node'] == run['checkpoint']['node'] == 5
    assert run['resources']['hero-0'] == {'hp': 300, 'mp': 20}
    saved = copy.deepcopy(run['resources'])
    with pytest.raises(ValueError):
        transition(run, 'camp', {'choice': 'rest'})
    assert run['resources'] == saved
    run['status'] = 'failed'
    run['resources']['hero-0']['hp'] = 1
    transition(run, 'retry', {})
    assert run['resources'] == saved and run['retries'] == 1


@pytest.mark.parametrize('tier', ['threshold', 'reflection', 'heart'])
def test_complete_ten_node_route_and_resource_carry(tier):
    run = new_run(tier, party(powerful=True, team_bp=TIERS[tier]['recommended_team_bp']), 123)
    while run['status'] == 'active':
        if run.get('battle') and run['battle']['status'] != 'resolved':
            snapshot = LabyrinthBattle.restore(run['battle']).public_snapshot()
            if snapshot['status'] == 'preparing':
                transition(run, 'confirm', {'positions': {unit['tag']: unit['slot'] for unit in snapshot['board']['bottom'] if unit}})
            elif snapshot['actionOptions']:
                option = snapshot['actionOptions'][0]
                transition(run, 'action', {'action': {'actorTag': snapshot['activeActorTag'], 'kind': 'attack',
                           'targetTag': option['targets'][0], 'expectedEventCount': len(snapshot['events'])}})
            else:
                transition(run, 'advance', {})
        elif run.get('pendingReward'):
            transition(run, 'reward', {'choice': 'edge'})
        elif run['node'] == 3:
            transition(run, 'event', {'choice': 'study'})
        elif run['node'] == 7:
            transition(run, 'shop', {'choice': 'ward'})
        elif run['node'] in {4, 9}:
            transition(run, 'camp', {'choice': 'boon'})
        else:
            transition(run, 'enter', {'branch': 'A' if run['node'] in {2, 6} else 'default'})
    assert run['status'] == 'completed' and run['node'] == 11
    assert run['clearedNodes'] == list(range(1, 11))
    assert run['totalRounds'] >= 6
    assert len([item for item in run['rewardHistory'] if item['kind'] == 'reward']) == 5
    assert run['relics'] == {'edge': 5, 'ward': 1}


@pytest.mark.parametrize('bp,valid', [(949, False), (950, True), (1000, True), (1050, True), (1051, False)])
def test_single_companion_entry_enforces_inclusive_five_percent_band(bp, valid):
    hero = party()[0]
    hero['character']['BP'] = str(bp)
    if valid:
        run = new_run('threshold', [hero], 7)
        assert public_run(run, 'one')['honorEligible']
    else:
        with pytest.raises(ValueError, match='±5%'):
            new_run('threshold', [hero], 7)


def test_each_encounter_waits_for_board_confirmation_without_resource_cost():
    run = new_run('threshold', party(powerful=True), 4)
    transition(run, 'enter', {})
    snapshot = public_run(run, 'test')['battleSession']
    assert snapshot['status'] == 'preparing' and snapshot['activeActorTag'] is None and not snapshot['events']
    resources = copy.deepcopy(run['resources'])
    with pytest.raises(ValueError, match='confirm'):
        transition(run, 'advance', {})
    with pytest.raises(BattleSessionError):
        transition(run, 'confirm', {'positions': {'A1': 5, 'A2': 5, 'A3': 2, 'A4': 3}})
    transition(run, 'confirm', {'positions': {'A1': 5, 'A2': 0, 'A3': 1, 'A4': 2}})
    assert [hero['slot'] for hero in run['party']] == [5, 0, 1, 2]
    assert run['resources'] == resources
    assert public_run(run, 'test')['battleSession']['status'] != 'preparing'


def test_rewards_apply_to_actual_battle_stats_and_cannot_be_claimed_twice():
    run = new_run('threshold', party(), 10)
    run['pendingReward'] = {'floor': 1, 'lumens': 12, 'choices': []}
    before = int(run['party'][0]['character']['state']['ATK'])
    with pytest.raises(ValueError, match='reward'):
        transition(run, 'enter', {})
    transition(run, 'reward', {'choice': 'edge'})
    assert int(party_with_relics(run)[0]['character']['state']['ATK']) == round(before * 1.05)
    with pytest.raises(ValueError, match='unclaimed'):
        transition(run, 'reward', {'choice': 'edge'})
    transition(run, 'enter', {})
    assert LabyrinthBattle.restore(run['battle']).team_a_units[0].atk == round(before * 1.05)


def test_events_trades_and_checkpoint_restore_do_not_farm_rewards():
    run = new_run('threshold', party(), 5)
    run['node'] = 3
    transition(run, 'event', {'choice': 'study'})
    assert run['lumens'] == 20 and run['node'] == 4
    transition(run, 'camp', {'choice': 'rest'})
    checkpoint = copy.deepcopy(run['checkpoint'])
    run['node'] = 7
    with pytest.raises(ValueError, match='Lumens'):
        transition(run, 'shop', {'choice': 'ward'})
    assert run['lumens'] == 20
    run['lumens'] = 40
    transition(run, 'shop', {'choice': 'ward'})
    assert run['lumens'] == 0 and run['relics'] == {'ward': 1}
    assert run['resources']['hero-0']['hp'] == 1080
    run['status'] = 'failed'
    transition(run, 'retry', {})
    assert run['lumens'] == checkpoint['lumens'] == 20
    assert run['relics'] == {} and run['node'] == 5
    assert run['rewardHistory'] == checkpoint['rewardHistory']
