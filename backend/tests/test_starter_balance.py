import json
from pathlib import Path

from game_logic import STAT_COSTS
from starter_cards import STARTER_CARDS


def test_starter_bp_matches_actual_stat_budget_and_frontend_projection():
    text = (Path(__file__).resolve().parents[2] / 'frontend/src/lib/starterBalance.ts').read_text(encoding='utf-8')
    projection = json.loads(text.split(' = ', 1)[1].strip().removesuffix(';'))
    assert len(STARTER_CARDS) == len(projection) == 8
    for card in STARTER_CARDS:
        assert card['BP'] == '1000' and card['rarity'] == 'common'
        assert sum(int(card['state'][key]) * cost for key, cost in STAT_COSTS.items()) == 1000
        assert projection[card['name']] == card
        assert int(card['state']['HP']) > 0 and int(card['state']['ATK']) > 0
        assert all(0 < int(skill['MP_COST']) <= int(card['state']['MP']) for skill in card['skill'].values())
