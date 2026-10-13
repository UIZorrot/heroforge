import copy
import uuid

import pytest
import pve_preview as preview
from test_void_labyrinth import party


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(preview, 'state_path', tmp_path / 'preview.json')
    monkeypatch.setattr(preview, 'state', {'runs': {}, 'firstClears': []})
    return preview.app.test_client()


def post(client, path, run, **data):
    body = {'revision': run['revision'], 'requestId': str(uuid.uuid4()), **data}
    response = client.post(f"/api/pve/runs/{run['id']}/{path}", json=body)
    assert response.status_code == 200, response.get_data(as_text=True)
    return response.get_json()['data'], body


def test_local_service_blocks_external_origins_and_out_of_band_bp(client):
    assert client.get('/api/pve/catalog', headers={'Origin': 'https://example.com'}).status_code == 403
    assert client.get('/api/pve/catalog', environ_base={'REMOTE_ADDR': '10.0.0.5'}).status_code == 403
    assert client.get('/api/pve/catalog', headers={'Origin': 'http://127.0.0.1:5187'}).status_code == 200
    heroes = party()
    heroes[0]['character']['BP'] = '5000'
    assert client.post('/api/pve/runs', json={'tier': 'threshold', 'party': heroes, 'requestId': 'wrong-bp'}).status_code == 409
    assert preview.state['runs'] == {}


def test_http_climb_saves_preparation_rewards_and_awards_preview_dust_once(client):
    heroes = party(powerful=True)
    for attempt in range(2):
        response = client.post('/api/pve/runs', json={'tier': 'threshold', 'party': heroes, 'requestId': str(uuid.uuid4())})
        assert response.status_code == 201
        run = response.get_json()['data']
        steps = 0
        while run['status'] == 'active':
            steps += 1
            assert steps < 250
            room = run['battleSession']
            if room and room['status'] != 'resolved':
                if room['status'] == 'preparing':
                    positions = {unit['tag']: (unit['slot'] + 1) % 6 for unit in room['board']['bottom'] if unit}
                    saved = client.get(f"/api/pve/runs/{run['id']}").get_json()['data']
                    assert saved['battleSession']['board'] == room['board']
                    run, body = post(client, 'confirm', run, positions=positions)
                elif room['actionOptions']:
                    option = room['actionOptions'][0]
                    run, body = post(client, 'action', run, action={'actorTag': room['activeActorTag'], 'kind': 'attack',
                                     'targetTag': option['targets'][0], 'expectedEventCount': len(room['events'])})
                else:
                    run, body = post(client, 'advance', run)
            elif run.get('pendingReward'):
                run, body = post(client, 'reward', run, choice='edge')
                duplicate = client.post(f"/api/pve/runs/{run['id']}/reward", json=body)
                assert duplicate.status_code == 200 and duplicate.get_json()['data']['relics'] == run['relics']
            elif run['node'] == 3:
                run, body = post(client, 'event', run, choice='study')
            elif run['node'] == 7:
                run, body = post(client, 'shop', run, choice='ward')
            elif run['node'] in {4, 9}:
                run, body = post(client, 'camp', run, choice='rest')
            else:
                run, body = post(client, 'enter', run, branch='A' if run['node'] in {2, 6} else 'default')
        assert run['node'] == 11 and run['status'] == 'completed'
        assert run['reward']['dust'] == (75 if attempt == 0 else 0)
        assert run['reward']['firstClear'] is (attempt == 0)
        assert preview.state_path.exists()
    assert preview.state['firstClears'] == ['threshold']
    assert len(preview.state['runs']) == 2
