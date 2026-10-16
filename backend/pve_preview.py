"""Loopback-only development client for the real campaign transition engine.

Never register these routes on the production app. No user accounts, real
wallets, private credentials or production database are accessed here.
"""
import copy
import json
import os
import secrets
import threading
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from flask import Flask, jsonify, request
from battle_sessions import BattleSessionError
from pve_content import CLIMB_VERSIONS, TIERS, FIRST_CLEAR_DUST, catalog
from pve_runs import new_run, public_run, transition

app = Flask(__name__)
lock = threading.RLock()
state_path = Path(os.getenv('HF_PVE_PREVIEW_STATE_PATH', Path(__file__).resolve().parents[1] / '_local/void-labyrinth-preview.json'))
state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {'runs': {}, 'firstClears': []}


def save():
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temp = state_path.with_suffix('.tmp')
    temp.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
    temp.replace(state_path)


@app.before_request
def local_only():
    origin = request.headers.get('Origin')
    if request.remote_addr not in {'127.0.0.1', '::1'} or origin and urlparse(origin).hostname not in {'127.0.0.1', 'localhost', '::1'}:
        return jsonify({'error': 'This test service only accepts local development clients.'}), 403


@app.errorhandler(ValueError)
@app.errorhandler(TypeError)
@app.errorhandler(KeyError)
@app.errorhandler(BattleSessionError)
def invalid(error):
    return jsonify({'error': str(error)}), 409


@app.get('/api/pve/catalog')
def read_catalog():
    return jsonify({'data': catalog()})


@app.get('/api/pve/runs/active')
def active():
    with lock:
        for run_id, run in reversed(list(state['runs'].items())):
            if run['status'] in {'active', 'failed'}:
                return jsonify({'data': public_run(run, run_id)})
    return jsonify({'data': None})


@app.post('/api/pve/runs')
def create():
    data = request.get_json() or {}
    if not isinstance(data, dict) or not isinstance(data.get('requestId'), str) or not 1 <= len(data['requestId']) <= 128:
        raise ValueError('A valid requestId is required.')
    with lock:
        for run_id, run in state['runs'].items():
            if run.get('creationKey') == data.get('requestId'):
                return jsonify({'data': public_run(run, run_id)})
        if any(run['status'] in {'active', 'failed'} for run in state['runs'].values()):
            raise ValueError('Continue or end your existing test climb first.')
        party = data.get('party')
        if not isinstance(party, list):
            raise ValueError('Choose your test companions.')
        if data.get('tier', 'adaptive') not in {*TIERS, 'adaptive'}:
            raise ValueError('Choose the Void Labyrinth expedition.')
        run = new_run('adaptive', party, secrets.randbits(31))
        run['creationKey'] = data.get('requestId')
        run_id = str(uuid4())
        state['runs'][run_id] = run
        save()
        return jsonify({'data': public_run(run, run_id)}), 201


@app.get('/api/pve/runs/<run_id>')
def read(run_id):
    with lock:
        if run_id not in state['runs']:
            return jsonify({'error': 'Test climb not found.'}), 404
        return jsonify({'data': public_run(state['runs'][run_id], run_id)})


@app.post('/api/pve/runs/<run_id>/<operation>')
def mutate(run_id, operation):
    if operation not in {'enter', 'confirm', 'action', 'advance', 'camp', 'reward', 'event', 'shop', 'retry', 'abandon'}:
        return jsonify({'error': 'Action not found.'}), 404
    data = request.get_json() or {}
    key = data.get('requestId')
    if not isinstance(key, str) or not 1 <= len(key) <= 128:
        raise ValueError('A requestId is required.')
    signature = json.dumps([operation, data], sort_keys=True)
    with lock:
        if run_id not in state['runs']:
            return jsonify({'error': 'Test climb not found.'}), 404
        run = copy.deepcopy(state['runs'][run_id])
        if key in run['receipts']:
            if run['receipts'][key] != signature:
                raise ValueError('A requestId cannot be reused for another action.')
            return jsonify({'data': public_run(run, run_id)})
        if type(data.get('revision')) is not int or data['revision'] != run['revision']:
            raise ValueError('The test climb has changed. Refresh before acting.')
        transition(run, operation, data)
        run['revision'] += 1
        run['receipts'][key] = signature
        run['receiptOrder'].append(key)
        if len(run['receipts']) > 64:
            run['receipts'].pop(run['receiptOrder'].pop(0))
        if run['status'] == 'completed':
            first = run['tier'] not in state['firstClears']
            dust = FIRST_CLEAR_DUST[run['tier']] if first and run['contentVersion'] in CLIMB_VERSIONS else 0
            if first:
                state['firstClears'].append(run['tier'])
            run['reward'] = {'firstClear': first, 'dust': dust, 'message': f'Test clear · {dust} preview Dust. No live wallet was changed.'}
        state['runs'][run_id] = run
        save()
        return jsonify({'data': public_run(run, run_id)})


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5545, debug=False, use_reloader=False)
