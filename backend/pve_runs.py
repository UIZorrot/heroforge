"""Pure campaign transitions; API persists each transition in one transaction."""
import copy

from pve_battle import LabyrinthBattle
from pve_content import VERSION, THEME, TIERS, NODES, encounter_for


def new_run(tier, party, seed):
    if tier not in TIERS:
        raise ValueError("Choose a valid labyrinth depth.")
    if not 1 <= len(party) <= 4 or len({hero['id'] for hero in party}) != len(party):
        raise ValueError("Choose one to four different companions.")
    if len({hero['slot'] for hero in party}) != len(party) or any(type(hero['slot']) is not int or not 0 <= hero['slot'] < 6 for hero in party):
        raise ValueError("Positions must be unique and between 0 and 5.")
    resources = {hero['id']: {'hp': int(hero['character']['state']['HP']), 'mp': int(hero['character']['state']['MP'])} for hero in party}
    if any(value['hp'] <= 0 or value['mp'] < 0 for value in resources.values()):
        raise ValueError("A companion has invalid base resources.")
    run = {'theme': THEME, 'contentVersion': VERSION, 'tier': tier, 'party': copy.deepcopy(party),
           'teamBp': sum(int(hero['character']['BP']) for hero in party), 'seed': seed, 'revision': 0,
           'status': 'active', 'node': 1, 'furthestNode': 1, 'clearedNodes': [], 'branches': {},
           'resources': resources, 'boon': False, 'battle': None, 'retries': 0, 'totalRounds': 0,
           'receipts': {}, 'receiptOrder': [], 'reward': None}
    run['checkpoint'] = checkpoint(run)
    return run


def checkpoint(run):
    return copy.deepcopy({key: run[key] for key in ('node', 'resources', 'boon', 'clearedNodes')})


def _settle(run, room):
    run['battle'] = room.export_state()
    if room.status != 'resolved':
        return
    run['totalRounds'] += room.round
    for unit in room.team_a_units:
        if unit:
            hero = unit.hero
            run['resources'][hero['id']] = {'hp': min(unit.hp, int(hero['character']['state']['HP'])),
                                            'mp': min(unit.mp, int(hero['character']['state']['MP']))}
    if room.result['cleared']:
        run['clearedNodes'].append(run['node'])
        run['node'] += 1
        run['furthestNode'] = max(run['furthestNode'], run['node'])
        if run['node'] == 11:
            run['status'] = 'completed'
    else:
        run['status'] = 'failed'


def transition(run, operation, data):
    if operation == 'abandon':
        if run['status'] not in {'active', 'failed'}:
            raise ValueError('This expedition has ended.')
        run['status'] = 'abandoned'
        return
    if operation == 'retry':
        if run['status'] != 'failed':
            raise ValueError('A checkpoint can only be restored after defeat.')
        run.update(copy.deepcopy(run['checkpoint']))
        run.update(status='active', battle=None, retries=run['retries'] + 1)
        return
    if run['status'] != 'active':
        raise ValueError('This expedition cannot act right now.')
    if operation in {'action', 'advance'}:
        if not run.get('battle'):
            raise ValueError('Enter an encounter first.')
        room = LabyrinthBattle.restore(run['battle'])
        if room.status == 'resolved':
            raise ValueError('This encounter has ended.')
        if operation == 'action':
            room.submit_action(data.get('action') or {})
        else:
            room.step_enemy()
        _settle(run, room)
        return
    if run.get('battle') and run['battle']['status'] != 'resolved':
        raise ValueError('Complete the current encounter first.')
    node = NODES[f"N{run['node']}"]
    if operation == 'camp':
        if node['kind'] != 'camp':
            raise ValueError('This chamber is not a camp.')
        choice = data.get('choice')
        if choice == 'rest':
            revive_id = data.get('reviveHeroId')
            dead = [hero_id for hero_id, value in run['resources'].items() if value['hp'] <= 0]
            if dead and revive_id not in dead or not dead and revive_id:
                raise ValueError('Choose a companion who fell in this expedition to revive.')
            for hero in run['party']:
                value = run['resources'][hero['id']]
                max_hp, max_mp = int(hero['character']['state']['HP']), int(hero['character']['state']['MP'])
                if hero['id'] == revive_id:
                    value.update(hp=max(1, round(max_hp * .30)), mp=round(max_mp * .20))
                elif value['hp'] > 0:
                    value['hp'] = min(max_hp, value['hp'] + round(max_hp * .35))
                    value['mp'] = min(max_mp, value['mp'] + round(max_mp * .35))
        elif choice == 'boon':
            run['boon'] = True
        else:
            raise ValueError('Choose rest or lantern vow.')
        run['clearedNodes'].append(run['node'])
        run['node'] += 1
        run['furthestNode'] = max(run['furthestNode'], run['node'])
        run['battle'] = None
        run['checkpoint'] = checkpoint(run)
        return
    if operation != 'enter' or node['kind'] == 'camp':
        raise ValueError('This action is not available in this chamber.')
    if run['contentVersion'] != VERSION:
        raise ValueError('The content version required by this expedition is unavailable.')
    variant = data.get('branch', 'default')
    if 'variants' in node:
        saved = run['branches'].get(node['id'])
        if saved and variant != saved:
            raise ValueError('This passage is already chosen. Retrying does not change the route.')
        if variant not in node['variants']:
            raise ValueError('Choose passage A or B.')
        run['branches'][node['id']] = variant
    encounter = encounter_for(run['tier'], node['id'], variant)
    room = LabyrinthBattle(encounter, run['party'], run['resources'], run['seed'] + run['node'] * 31 + (1 if variant == 'B' else 0), run['boon'])
    run['boon'] = False
    _settle(run, room)


def public_run(run, run_id):
    result = {key: copy.deepcopy(run[key]) for key in ('theme', 'contentVersion', 'tier', 'teamBp', 'revision', 'status', 'node', 'furthestNode',
               'clearedNodes', 'branches', 'resources', 'party', 'boon', 'retries', 'totalRounds', 'reward')}
    result['id'] = str(run_id)
    result['checkpointNode'] = run['checkpoint']['node']
    result['honorEligible'] = len(run['party']) == 4 and TIERS[run['tier']]['honor_bp_band'][0] <= run['teamBp'] <= TIERS[run['tier']]['honor_bp_band'][1]
    result['battleSession'] = LabyrinthBattle.restore(run['battle']).public_snapshot() if run.get('battle') else None
    return result
