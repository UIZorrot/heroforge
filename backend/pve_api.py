"""Authenticated, server-authoritative campaign API, serialized by PostgreSQL row locks."""
import copy
import hashlib
import json
import secrets
from uuid import UUID

from flask import jsonify, request
from battle_sessions import BattleSessionError
from db import get_connection, serialize_json
from pve_content import THEME, VERSION, FIRST_CLEAR_DUST, catalog
from pve_runs import new_run, public_run, transition


def _request_key(data):
    key = data.get('requestId')
    if not isinstance(key, str) or not 1 <= len(key) <= 128:
        raise ValueError('A valid requestId is required.')
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return key, fingerprint


def _body():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        raise ValueError('The request body must be an object.')
    return data


def register_pve_routes(app, auth_required, current_user):
    @app.route('/api/pve/catalog', methods=['GET'])
    @auth_required
    def pve_catalog():
        return jsonify({'data': catalog()})

    @app.route('/api/pve/runs/active', methods=['GET'])
    @auth_required
    def pve_active():
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT id, run_payload FROM pve_runs WHERE user_id=%s AND theme_key=%s AND run_payload ? 'contentVersion' AND status IN ('active','failed') ORDER BY created_at DESC LIMIT 1", (current_user()['id'], THEME))
            row = cur.fetchone()
        return jsonify({'data': public_run(row['run_payload'], row['id']) if row else None})

    @app.route('/api/pve/runs', methods=['POST'])
    @auth_required
    def pve_create():
        try:
            data = _body()
            key, fingerprint = _request_key(data)
            ids = data.get('heroIds')
            if not isinstance(ids, list) or not 1 <= len(ids) <= 4 or len(set(ids)) != len(ids):
                raise ValueError('Choose one to four different companions.')
            ids = [str(UUID(str(hero_id))) for hero_id in ids]
            slots = data.get('slots', list(range(len(ids))))
            if not isinstance(slots, list) or len(slots) != len(ids):
                raise ValueError('Choose a position for each companion.')
            user_id = current_user()['id']
            with get_connection() as conn, conn.cursor() as cur:
                # Serializes creation for this account, including an initially empty active-run list.
                cur.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', (user_id,))
                cur.execute("SELECT id, run_payload FROM pve_runs WHERE user_id=%s AND theme_key=%s AND run_payload ? 'contentVersion' ORDER BY created_at DESC", (user_id, THEME))
                existing = cur.fetchall()
                for row in existing:
                    payload = row['run_payload']
                    if payload.get('creationKey') == key:
                        if payload.get('creationFingerprint') != fingerprint:
                            raise ValueError('The same requestId cannot contain different content.')
                        return jsonify({'data': public_run(payload, row['id'])}), 200
                if any(row['run_payload'].get('status') in {'active', 'failed'} for row in existing):
                    raise ValueError('An expedition is already in progress. Continue it or end it before starting another.')
                cur.execute('SELECT id, hero_payload, source_payload, card_status FROM heroes WHERE user_id=%s AND id=ANY(%s::uuid[]) FOR SHARE', (user_id, ids))
                rows = {str(row['id']): row for row in cur.fetchall()}
                if set(rows) != set(ids):
                    raise ValueError('A companion does not belong to this account or no longer exists.')
                party = []
                for hero_id, slot in zip(ids, slots):
                    row = rows[hero_id]
                    if row['card_status'] != 'active':
                        raise ValueError('A locked or dismantled companion cannot enter the labyrinth.')
                    party.append({'id': hero_id, 'slot': slot, 'character': copy.deepcopy(row['hero_payload']),
                                  'image': row['source_payload'].get('image_url')})
                run = new_run(data.get('tier'), party, secrets.randbits(31))
                run.update(creationKey=key, creationFingerprint=fingerprint)
                cur.execute("INSERT INTO pve_runs (user_id,theme_key,seed,run_payload) VALUES (%s,%s,%s,%s::jsonb) RETURNING id", (user_id, THEME, run['seed'], serialize_json(run)))
                run_id = cur.fetchone()['id']
                conn.commit()
            return jsonify({'data': public_run(run, run_id)}), 201
        except (ValueError, TypeError, KeyError) as error:
            return jsonify({'error': str(error)}), 409

    @app.route('/api/pve/runs/<run_id>', methods=['GET'])
    @auth_required
    def pve_read(run_id):
        try:
            run_id = str(UUID(run_id))
        except ValueError:
            return jsonify({'error': 'Expedition not found.'}), 404
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT id, run_payload FROM pve_runs WHERE id=%s AND user_id=%s AND theme_key=%s AND run_payload ? 'contentVersion'", (run_id, current_user()['id'], THEME))
            row = cur.fetchone()
        return jsonify({'data': public_run(row['run_payload'], row['id'])}) if row else (jsonify({'error': 'Expedition not found.'}), 404)

    @app.route('/api/pve/runs/<run_id>/<operation>', methods=['POST'])
    @auth_required
    def pve_mutate(run_id, operation):
        if operation not in {'enter', 'confirm', 'action', 'advance', 'camp', 'retry', 'abandon', 'reward', 'event', 'shop'}:
            return jsonify({'error': 'Action not found.'}), 404
        try:
            run_id = str(UUID(run_id))
            data = _body()
            key, fingerprint = _request_key(data)
            user_id = current_user()['id']
            with get_connection() as conn, conn.cursor() as cur:
                cur.execute("SELECT run_payload FROM pve_runs WHERE id=%s AND user_id=%s AND theme_key=%s AND run_payload ? 'contentVersion' FOR UPDATE", (run_id, user_id, THEME))
                row = cur.fetchone()
                if not row:
                    return jsonify({'error': 'Expedition not found.'}), 404
                run = row['run_payload']
                receipt = run['receipts'].get(key)
                if receipt:
                    if receipt != f'{operation}:{fingerprint}':
                        raise ValueError('The same requestId cannot be used for a different action.')
                    return jsonify({'data': public_run(run, run_id)})
                if type(data.get('revision')) is not int or data['revision'] != run['revision']:
                    raise ValueError('The expedition has changed. Refresh before acting.')
                transition(run, operation, data)
                run['revision'] += 1
                run['receipts'][key] = f'{operation}:{fingerprint}'
                run.setdefault('receiptOrder', []).append(key)
                # Old retries outside the receipt window fail revision validation rather than execute twice.
                if len(run['receipts']) > 64:
                    run['receipts'].pop(run['receiptOrder'].pop(0))
                if run['status'] == 'completed':
                    cur.execute('INSERT INTO pve_first_clears (user_id,theme_key,tier,run_id,content_version) VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING run_id',
                                (user_id, THEME, run['tier'], run_id, run['contentVersion']))
                    awarded = cur.fetchone() is not None
                    dust = FIRST_CLEAR_DUST[run['tier']] if awarded and run['contentVersion'] == VERSION else 0
                    if dust:
                        cur.execute('UPDATE user_wallets SET dust_balance=dust_balance+%s,updated_at=now() WHERE user_id=%s RETURNING dust_balance', (dust, user_id))
                        wallet = cur.fetchone()
                        if not wallet:
                            raise ValueError('Reward wallet is unavailable. Retry after signing in.')
                        cur.execute("INSERT INTO resource_transactions (user_id,resource_type,delta,balance_after,reason,ref_type,ref_id,metadata) VALUES (%s,'dust',%s,%s,'void_labyrinth_first_clear','pve_run',%s,%s::jsonb)",
                                    (user_id, dust, wallet['dust_balance'], run_id, serialize_json({'tier': run['tier'], 'contentVersion': run['contentVersion']})))
                    run['reward'] = {'firstClear': awarded, 'dust': dust, 'message': f'First clear · {dust} Dust added to your wallet.' if dust else 'Clear recorded. The one-time reward for this depth has already been claimed.'}
                cur.execute('UPDATE pve_runs SET status=%s,current_floor=%s,max_floor_reached=%s,run_payload=%s::jsonb,ended_at=CASE WHEN %s IN (\'completed\',\'abandoned\') THEN now() ELSE NULL END WHERE id=%s',
                            (run['status'], run['node'], run['furthestNode'], serialize_json(run), run['status'], run_id))
                conn.commit()
            return jsonify({'data': public_run(run, run_id)})
        except (ValueError, TypeError, KeyError, BattleSessionError) as error:
            return jsonify({'error': str(error)}), 409
