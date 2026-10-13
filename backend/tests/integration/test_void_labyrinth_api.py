import json
import uuid

import pytest


def create(harness, headers, tier='threshold', key=None):
    heroes = harness.heroes(headers)[:1 if tier == 'threshold' else 4]
    if tier != 'threshold':
        budget = {'reflection': 5000, 'heart': 10000}[tier] // len(heroes)
        for hero in heroes:
            hero['hero_payload']['BP'] = str(budget)
            harness.db_module.execute('UPDATE heroes SET hero_payload=%s::jsonb WHERE id=%s', (json.dumps(hero['hero_payload']), hero['id']))
    body = {'tier': tier, 'heroIds': [hero['id'] for hero in heroes], 'slots': list(range(len(heroes))),
            'requestId': key or str(uuid.uuid4()), 'teamBp': 999999, 'entryCost': 999999}
    response = harness.client.post('/api/pve/runs', headers=headers, json=body)
    assert response.status_code in {200, 201}, response.get_data(as_text=True)
    return response.get_json()['data'], body


@pytest.mark.integration
def test_pve_creation_is_free_authoritative_owned_and_idempotent(harness):
    headers = harness.login('void-creation@example.com')
    heroes = harness.heroes(headers)
    before = harness.db_module.get_user_wallet(harness.last_user['id'])['dust_balance']
    run, body = create(harness, headers)
    assert run['teamBp'] == sum(int(hero['hero_payload']['BP']) for hero in heroes[:1])
    again = harness.client.post('/api/pve/runs', headers=headers, json=body)
    assert again.status_code == 200 and again.get_json()['data']['id'] == run['id']
    assert harness.db_module.get_user_wallet(harness.last_user['id'])['dust_balance'] == before
    legacy = harness.client.post('/api/pve/start', headers=headers, json={'themeKey': 'void_labyrinth', 'heroIds': body['heroIds']})
    assert legacy.status_code == 400
    assert harness.db_module.get_user_wallet(harness.last_user['id'])['dust_balance'] == before
    assert harness.client.post('/api/pve/runs', headers=headers, json=['invalid']).status_code == 409
    other = harness.login('void-other@example.com')
    assert harness.client.get(f"/api/pve/runs/{run['id']}", headers=other).status_code == 404
    body['requestId'] = str(uuid.uuid4())
    assert harness.client.post('/api/pve/runs', headers=other, json=body).status_code == 409
    assert harness.client.get('/api/pve/catalog').status_code == 401


@pytest.mark.integration
def test_pve_mutations_persist_without_manager_and_reject_stale_or_reused_keys(harness):
    headers = harness.login('void-resume@example.com')
    run, _ = create(harness, headers, 'heart')
    url = f"/api/pve/runs/{run['id']}/enter"
    body = {'requestId': 'enter-once', 'revision': run['revision'], 'branch': 'default'}
    response = harness.client.post(url, headers=headers, json=body)
    assert response.status_code == 200, response.get_data(as_text=True)
    started = response.get_json()['data']
    replay = harness.client.post(url, headers=headers, json=body)
    assert replay.status_code == 200 and replay.get_json()['data']['revision'] == started['revision']
    stale = harness.client.post(url, headers=headers, json={**body, 'requestId': 'new-stale'})
    assert stale.status_code == 409
    changed = harness.client.post(url, headers=headers, json={**body, 'branch': 'B'})
    assert changed.status_code == 409
    # Campaign state lives in PostgreSQL; unrelated in-memory battle sessions can be removed.
    harness.app_module.battle_sessions.MANAGER._sessions.clear()
    restored = harness.client.get(f"/api/pve/runs/{run['id']}", headers=headers).get_json()['data']
    assert restored['battleSession']['board'] == started['battleSession']['board']
    assert restored['battleSession']['activeActorTag'] == started['battleSession']['activeActorTag']
    abandoned = harness.client.post(f"/api/pve/runs/{run['id']}/abandon", headers=headers,
                                  json={'requestId': 'end', 'revision': started['revision']})
    assert abandoned.status_code == 200
    assert harness.client.get('/api/pve/runs/active', headers=headers).get_json()['data'] is None


@pytest.mark.integration
def test_pve_full_route_first_clear_ledger_and_repeat_clear(harness):
    headers = harness.login('void-full-route@example.com')
    for hero in harness.heroes(headers)[:4]:
        payload = hero['hero_payload']
        payload['state'].update(HP='100000', ATK='100000', SPEED='1000', TYPE='Ranged')
        harness.db_module.execute('UPDATE heroes SET hero_payload=%s::jsonb WHERE id=%s', (json.dumps(payload), hero['id']))
    user_id = harness.last_user['id']
    wallet_before = harness.db_module.get_user_wallet(user_id)['dust_balance']
    for attempt in range(2):
        run, _ = create(harness, headers)
        last_body = None
        while run['status'] == 'active':
            room = run['battleSession']
            input_data = {}
            if room and room['status'] != 'resolved':
                if room['status'] == 'preparing':
                    operation = 'confirm'
                    input_data['positions'] = {unit['tag']: unit['slot'] for unit in room['board']['bottom'] if unit}
                elif room['actionOptions']:
                    operation = 'action'
                    option = room['actionOptions'][0]
                    input_data['action'] = {'actorTag': room['activeActorTag'], 'kind': 'attack',
                                           'targetTag': option['targets'][0], 'expectedEventCount': len(room['events'])}
                else:
                    operation = 'advance'
            elif run.get('pendingReward'):
                operation = 'reward'
                input_data['choice'] = 'edge'
            elif run['node'] == 3:
                operation = 'event'
                input_data['choice'] = 'study'
            elif run['node'] == 7:
                operation = 'shop'
                input_data['choice'] = 'ward'
            elif run['node'] in {4, 9}:
                operation = 'camp'
                input_data['choice'] = 'boon'
            else:
                operation = 'enter'
                input_data['branch'] = 'B' if run['node'] in {2, 6} else 'default'
            url = f"/api/pve/runs/{run['id']}/{operation}"
            last_body = {**input_data, 'revision': run['revision'], 'requestId': str(uuid.uuid4())}
            response = harness.client.post(url, headers=headers, json=last_body)
            assert response.status_code == 200, response.get_data(as_text=True)
            run = response.get_json()['data']
        assert run['status'] == 'completed' and run['clearedNodes'] == list(range(1, 11))
        assert run['reward']['firstClear'] is (attempt == 0)
        assert run['reward']['dust'] == (75 if attempt == 0 else 0)
        duplicate = harness.client.post(url, headers=headers, json=last_body)
        assert duplicate.status_code == 200 and duplicate.get_json()['data']['revision'] == run['revision']
    count = harness.db_module.fetch_one('SELECT count(*) AS n FROM pve_first_clears WHERE user_id=%s', (user_id,))
    assert count['n'] == 1
    assert harness.db_module.get_user_wallet(user_id)['dust_balance'] == wallet_before + 75
    transactions = harness.db_module.fetch_one("SELECT count(*) AS n FROM resource_transactions WHERE user_id=%s AND reason='void_labyrinth_first_clear'", (user_id,))
    assert transactions['n'] == 1
