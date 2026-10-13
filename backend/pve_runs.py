"""Pure campaign transitions; API persists each transition in one transaction."""
import copy

from pve_battle import LabyrinthBattle
from pve_content import VERSION, THEME, TIERS, NODES, RELICS, bp_band, encounter_for


def new_run(tier, party, seed):
    if tier not in TIERS:
        raise ValueError("Choose a valid labyrinth depth.")
    if not 1 <= len(party) <= 4 or len({hero['id'] for hero in party}) != len(party):
        raise ValueError("Choose one to four different companions.")
    if len({hero['slot'] for hero in party}) != len(party) or any(type(hero['slot']) is not int or not 0 <= hero['slot'] < 6 for hero in party):
        raise ValueError("Positions must be unique and between 0 and 5.")
    team_bp = sum(int(hero['character']['BP']) for hero in party)
    lower, upper = bp_band(tier)
    if not lower <= team_bp <= upper:
        raise ValueError(f'Team BP must be {lower}–{upper} for this depth (±5%). Choose one to four companions.')
    resources = {hero['id']: {'hp': int(hero['character']['state']['HP']), 'mp': int(hero['character']['state']['MP'])} for hero in party}
    if any(value['hp'] <= 0 or value['mp'] < 0 for value in resources.values()):
        raise ValueError("A companion has invalid base resources.")
    run = {'theme': THEME, 'contentVersion': VERSION, 'tier': tier, 'party': copy.deepcopy(party),
           'teamBp': team_bp, 'seed': seed, 'revision': 0,
           'status': 'active', 'node': 1, 'furthestNode': 1, 'clearedNodes': [], 'branches': {},
           'resources': resources, 'boon': False, 'battle': None, 'retries': 0, 'totalRounds': 0,
           'receipts': {}, 'receiptOrder': [], 'reward': None, 'lumens': 0, 'relics': {},
           'pendingReward': None, 'rewardHistory': []}
    run['checkpoint'] = checkpoint(run)
    return run


def checkpoint(run):
    return copy.deepcopy({key: run[key] for key in ('node', 'resources', 'boon', 'clearedNodes', 'party',
                                                   'lumens', 'relics', 'pendingReward', 'rewardHistory') if key in run})


def party_with_relics(run):
    party = copy.deepcopy(run['party'])
    relics = run.get('relics', {})
    for hero in party:
        state = hero['character']['state']
        for key, relic, percent in (('ATK', 'edge', .05), ('HP', 'ward', .08)):
            state[key] = str(round(int(state[key]) * (1 + percent * relics.get(relic, 0))))
    return party


def recover(run, hp_ratio, mp_ratio):
    for hero in party_with_relics(run):
        value = run['resources'][hero['id']]
        if value['hp'] <= 0:
            continue
        for key, ratio in (('hp', hp_ratio), ('mp', mp_ratio)):
            maximum = int(hero['character']['state'][key.upper()])
            value[key] = min(maximum, value[key] + round(maximum * ratio))


def grant_relic(run, choice):
    if choice == 'renewal':
        recover(run, .25, .25)
    else:
        before = {hero['id']: int(hero['character']['state']['HP']) for hero in party_with_relics(run)}
        run.setdefault('relics', {})[choice] = run.get('relics', {}).get(choice, 0) + 1
        if choice == 'ward':
            for hero in party_with_relics(run):
                value = run['resources'][hero['id']]
                if value['hp'] > 0:
                    value['hp'] += int(hero['character']['state']['HP']) - before[hero['id']]


def finish_floor(run):
    run['clearedNodes'].append(run['node'])
    run['node'] += 1
    run['furthestNode'] = max(run['furthestNode'], run['node'])
    if run['node'] == 11:
        run['status'] = 'completed'


def node_for(run):
    node = copy.deepcopy(NODES[f"N{run['node']}"])
    # Existing expeditions keep their eight-combat route and saved snapshots.
    if run['contentVersion'] != VERSION and node['kind'] in {'event', 'shop'}:
        node['kind'] = 'battle'
    return node


def _settle(run, room):
    run['battle'] = room.export_state()
    if room.status != 'resolved':
        return
    run['totalRounds'] += room.round
    for unit in room.team_a_units:
        if unit:
            hero = unit.hero
            run['resources'][hero['id']] = {'hp': min(unit.hp, unit.max_hp), 'mp': min(unit.mp, unit.max_mp)}
    if room.result['cleared']:
        floor = run['node']
        if run['contentVersion'] == VERSION:
            amount = 40 if floor == 10 else 24 if floor == 8 else 12
            run['lumens'] = run.get('lumens', 0) + amount
            if floor != 10:
                run['pendingReward'] = {'floor': floor, 'lumens': amount, 'choices': list(RELICS.values())}
        finish_floor(run)
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
    if operation in {'action', 'advance', 'confirm'}:
        if not run.get('battle'):
            raise ValueError('Enter an encounter first.')
        room = LabyrinthBattle.restore(run['battle'])
        if room.status == 'resolved':
            raise ValueError('This encounter has ended.')
        if operation == 'confirm':
            room.confirm_preparation('A', data.get('positions'))
            positions = {unit.hero['id']: unit.slot_index for unit in room.team_a_units if unit}
            for hero in run['party']:
                hero['slot'] = positions[hero['id']]
        elif room.status == 'preparing':
            raise ValueError('Arrange your companions on the board and confirm before battle.')
        elif operation == 'action':
            room.submit_action(data.get('action') or {})
        else:
            room.step_enemy()
        _settle(run, room)
        return
    if run.get('battle') and run['battle']['status'] != 'resolved':
        raise ValueError('Complete the current encounter first.')
    if operation == 'reward':
        pending = run.get('pendingReward')
        if not pending:
            raise ValueError('There is no unclaimed floor reward.')
        choice = data.get('choice')
        if choice not in RELICS:
            raise ValueError('Choose a floor reward.')
        grant_relic(run, choice)
        run.setdefault('rewardHistory', []).append({'floor': pending['floor'], 'kind': 'reward', 'name': RELICS[choice]['name']})
        run['pendingReward'] = None
        return
    if run.get('pendingReward'):
        raise ValueError('Choose the cleared floor reward before ascending.')
    node = node_for(run)
    if operation == 'event':
        if node['kind'] != 'event':
            raise ValueError('This floor has no event.')
        choice = data.get('choice')
        if choice == 'study':
            run['lumens'] += 20
            recover(run, 0, .15)
            name = 'Read the tablets · 20 Lumens and 15% MP'
        elif choice == 'blood':
            for hero in party_with_relics(run):
                value = run['resources'][hero['id']]
                if value['hp'] > 0:
                    value['hp'] = max(1, value['hp'] - round(int(hero['character']['state']['HP']) * .10))
            grant_relic(run, 'edge')
            name = 'Blood inscription · 10% HP for Ember Edge'
        else:
            raise ValueError('Choose study or blood inscription.')
        run['rewardHistory'].append({'floor': run['node'], 'kind': 'event', 'name': name})
        finish_floor(run)
        run['battle'] = None
        return
    if operation == 'shop':
        if node['kind'] != 'shop':
            raise ValueError('This floor has no trader.')
        choice = data.get('choice')
        prices = {'edge': 45, 'ward': 40, 'renewal': 30, 'leave': 0}
        if choice not in prices:
            raise ValueError('Choose a lantern trade or leave.')
        if run['lumens'] < prices[choice]:
            raise ValueError('Not enough Lumens for this trade.')
        run['lumens'] -= prices[choice]
        if choice != 'leave':
            grant_relic(run, choice)
        run['rewardHistory'].append({'floor': run['node'], 'kind': 'shop', 'name': 'Passed the trader' if choice == 'leave' else RELICS[choice]['name']})
        finish_floor(run)
        run['battle'] = None
        return
    if operation == 'camp':
        if node['kind'] != 'camp':
            raise ValueError('This chamber is not a camp.')
        choice = data.get('choice')
        if choice == 'rest':
            revive_id = data.get('reviveHeroId')
            dead = [hero_id for hero_id, value in run['resources'].items() if value['hp'] <= 0]
            if dead and revive_id not in dead or not dead and revive_id:
                raise ValueError('Choose a companion who fell in this expedition to revive.')
            for hero in party_with_relics(run):
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
        finish_floor(run)
        run['battle'] = None
        run['checkpoint'] = checkpoint(run)
        return
    if operation != 'enter' or node['kind'] not in {'battle', 'elite', 'boss'}:
        raise ValueError('This action is not available in this chamber.')
    if run['contentVersion'] not in {VERSION, 'void-labyrinth-v1-prototype-1'}:
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
    room = LabyrinthBattle(encounter, party_with_relics(run), run['resources'], run['seed'] + run['node'] * 31 + (1 if variant == 'B' else 0), run['boon'], prepare=True)
    run['boon'] = False
    _settle(run, room)


def public_run(run, run_id):
    result = {key: copy.deepcopy(run[key]) for key in ('theme', 'contentVersion', 'tier', 'teamBp', 'revision', 'status', 'node', 'furthestNode',
               'clearedNodes', 'branches', 'resources', 'party', 'boon', 'retries', 'totalRounds', 'reward')}
    result['id'] = str(run_id)
    result['checkpointNode'] = run['checkpoint']['node']
    lower, upper = bp_band(run['tier'])
    result['honorEligible'] = lower <= run['teamBp'] <= upper
    result['party'] = party_with_relics(run)
    result.update(lumens=run.get('lumens', 0), relics=run.get('relics', {}), pendingReward=copy.deepcopy(run.get('pendingReward')),
                  rewardHistory=copy.deepcopy(run.get('rewardHistory', [])), legacy=run['contentVersion'] != VERSION)
    result['battleSession'] = LabyrinthBattle.restore(run['battle']).public_snapshot() if run.get('battle') else None
    return result
