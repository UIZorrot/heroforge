import copy
import json

import pytest

from game_logic import STAT_COSTS
from pve_content import ADAPTIVE_RATIOS, FIXED_CLIMB_VERSION, encounter_for, enemy_hero
from pve_runs import new_run, public_run, run_encounter, transition
from test_void_labyrinth import party


@pytest.mark.parametrize('bp', [1000, 1051, 1273, 4800, 5640, 17460, 50000])
@pytest.mark.parametrize('size', [1, 2, 3, 4])
def test_any_team_over_minimum_gets_exact_adaptive_enemy_budgets(bp, size):
    heroes = party()[:size]
    for hero in heroes:
        hero['character']['BP'] = str(bp // size)
    heroes[0]['character']['BP'] = str(bp - bp // size * (size - 1))
    run = new_run('adaptive', heroes, 7)
    assert run['teamBp'] == bp
    actual = sum(int(hero['character']['state'][key]) * cost for hero in heroes for key, cost in STAT_COSTS.items())
    assert run['entryPowerBp'] == max(bp, actual)
    for node, ratio in ADAPTIVE_RATIOS.items():
        encounter = encounter_for('adaptive', node, 'A' if node in {'N2', 'N6'} else 'default', power_bp=run['entryPowerBp'], party_size=size)
        assert encounter['enemy_total_bp'] == (run['entryPowerBp'] * ratio + 50) // 100
        assert sum(unit['bp'] for unit in encounter['enemies']) == encounter['enemy_total_bp']
        assert 1 <= len(encounter['enemies']) <= 6
        for entry in encounter['enemies']:
            state = enemy_hero(entry, encounter['enemy_total_bp'])['character']['state']
            assert sum(state[key] * cost for key, cost in STAT_COSTS.items()) == entry['bp']


def test_minimum_and_party_size_are_enforced_by_the_server():
    for bp in [0, 999]:
        heroes = party()[:1]
        heroes[0]['character']['BP'] = str(bp)
        with pytest.raises(ValueError, match='at least 1000'):
            new_run('adaptive', heroes, 2)
    with pytest.raises(ValueError, match='one to four'):
        new_run('adaptive', [], 2)


def test_preview_branch_and_real_board_share_budget_and_six_enemy_capacity():
    run = new_run('adaptive', party(team_bp=4800), 9)
    run['node'] = 6
    preview = public_run(run, 'saved')['encounterChoices']['B']
    resources = copy.deepcopy(run['resources'])
    transition(run, 'enter', {'branch': 'B'})
    snapshot = public_run(run, 'saved')['battleSession']
    enemies = [unit for unit in snapshot['board']['top'] if unit]
    assert snapshot['status'] == 'preparing' and not snapshot['events']
    assert run['resources'] == resources
    assert {unit['slot'] for unit in enemies} == {unit['slot'] for unit in preview['enemies']}
    assert len(enemies) == len(preview['enemies']) == 6
    assert sum(int(unit['maxHp']) for unit in enemies) > 0
    assert run['battle']['encounter']['enemy_total_bp'] == preview['enemyTotalBp']


def test_rewards_retries_and_json_restore_do_not_move_the_entry_budget():
    run = new_run('adaptive', party(), 10)
    node = {'id': 'N5'}
    expected = run_encounter(run, node)
    for choice in ['ward', 'edge', 'renewal']:
        run['pendingReward'] = {'floor': 1, 'lumens': 12, 'choices': []}
        transition(run, 'reward', {'choice': choice})
    assert run_encounter(run, node) == expected
    run['status'] = 'failed'
    transition(run, 'retry', {})
    restored = json.loads(json.dumps(run))
    assert run_encounter(restored, node) == expected
    assert restored['entryPartySize'] == 4


def test_existing_fixed_climbs_keep_their_events_rewards_and_encounter_budgets():
    run = new_run('reflection', party(team_bp=5000), 11)
    assert run['contentVersion'] == FIXED_CLIMB_VERSION
    assert not public_run(run, 'old')['legacy']
    run['node'] = 3
    transition(run, 'event', {'choice': 'study'})
    assert run['node'] == 4 and run['lumens'] == 20
    assert run_encounter(run, {'id': 'N5'}) == encounter_for('reflection', 'N5')
