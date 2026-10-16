import copy

import pytest

from forge_contract import POWER_TIERS, MARKERS, validate_analysis, validate_design
from game_logic import STAT_COSTS, adjust_based_on_bp, rarity_stat_budget


def analysis(**changes):
    return {'name': 'Lantern knight', 'description': 'An armoured adventurer carrying a lantern.', 'extra': 'An original traveller.',
            'power_tier': 'heroic', 'power_factor': 1, 'identity_status': 'original', 'identity_confidence': .5,
            'evidence': ['A lantern and a worn sword'], **changes}


def design():
    skill = {key: 0 for key in MARKERS}
    skill.update(name='Sword cut', description='Strike one enemy.', ROLE='attack', IS_PASSIVE=False,
                 TYPE='weapon', TARGET='Enemy', TARGET_NUM=1, RANGE='melee', IS_STUN=False, BUFF_TIME=0, BUFF_NAME='')
    return {'name': 'Injected deity', 'description': 'Unverified cosmic fiction', 'BP': '999999999', 'rarity': 'mythic',
            'template': 'knight', 'state_weights': {**{key: 5 for key in STAT_COSTS}, 'TYPE': 'weapon'},
            'skill': {'s1': skill, 's2': copy.deepcopy(skill)}}


@pytest.mark.parametrize('tier,anchor', POWER_TIERS.items())
def test_power_comes_from_the_fixed_tier_and_factor_not_model_supplied_bp(tier, anchor):
    payload = analysis(power_tier=tier, power_factor=1.12, BP='999999999', identity_status='recognized',
                       identity_confidence=.98, evidence=['Distinctive identity marker one', 'Distinctive identity marker two'])
    assert validate_analysis(payload)['BP'] == str(round(anchor * 1.12))


@pytest.mark.parametrize('changes', [{'power_factor': '1'}, {'power_factor': True}, {'power_factor': 1.21},
    {'power_factor': float('nan')}, {'power_tier': 'omnipotent'}, {'power_tier': []},
    {'identity_confidence': float('inf')}, {'evidence': []}, {'evidence': ['a'] * 5}])
def test_invalid_analysis_is_rejected_instead_of_getting_a_default_budget(changes):
    with pytest.raises(ValueError):
        validate_analysis(analysis(**changes))


@pytest.mark.parametrize('tier', ['legend', 'demigod', 'near_god', 'god'])
def test_unidentified_original_art_cannot_claim_divine_power(tier):
    with pytest.raises(ValueError, match='recognized identity'):
        validate_analysis(analysis(power_tier=tier))
    with pytest.raises(ValueError, match='recognized identity'):
        validate_analysis(analysis(power_tier=tier, identity_status='recognized', identity_confidence=.99, evidence=['Same detail', 'Same detail']))


def test_second_stage_cannot_change_bp_identity_or_choose_rarity():
    judged = validate_analysis(analysis())
    raw = design()
    validated = validate_design(raw, judged)
    assert validated['BP'] == '1000' and validated['name'] == 'Lantern knight'
    assert 'rarity' not in validated and 'rarity' in raw
    hero = adjust_based_on_bp({**validated, 'rarity': 'common'})
    assert hero['BP'] == '1000'
    assert sum(int(hero['state'][key]) * cost for key, cost in STAT_COSTS.items()) == 1000


@pytest.mark.parametrize('bad', ['weight', 'boolean', 'marker', 'target', 'passive', 'missing_skill'])
def test_design_structure_is_validated_before_generating_any_stats(bad):
    raw = design()
    if bad == 'weight': raw['state_weights']['HP'] = 9999
    if bad == 'boolean': raw['skill']['s1']['IS_PASSIVE'] = 'false'
    if bad == 'marker': raw['skill']['s1']['DMG'] = 50000
    if bad == 'target': raw['skill']['s1']['TARGET_NUM'] = 7
    if bad == 'passive': raw['skill']['s1']['IS_PASSIVE'] = True
    if bad == 'missing_skill': del raw['skill']['s2']
    with pytest.raises(ValueError):
        validate_design(raw, validate_analysis(analysis()))


@pytest.mark.parametrize('rarity', ['common', 'rare', 'epic', 'mythic'])
def test_rarity_only_adds_its_published_stat_bonus_not_a_higher_nominal_tier(rarity):
    validated = validate_design(design(), validate_analysis(analysis()))
    hero = adjust_based_on_bp({**validated, 'rarity': rarity})
    assert hero['BP'] == '1000'
    assert sum(int(hero['state'][key]) * cost for key, cost in STAT_COSTS.items()) == rarity_stat_budget(1000, rarity)
