import pytest

from config import get_settings


@pytest.mark.parametrize(
    "balance,cost,expected_balance,expected_cost",
    [
        ("", "", 500, 100),
        ("0", "100", 400, 100),
        ("500", "100", 500, 100),
        ("500", "200", 800, 200),
        ("900", "100", 900, 100),
        ("invalid", "invalid", 500, 100),
        ("-20", "-100", 0, 0),
    ],
)
def test_new_wallet_can_fund_four_forges(monkeypatch, balance, cost, expected_balance, expected_cost):
    monkeypatch.setenv("STARTER_DUST_BALANCE", balance)
    monkeypatch.setenv("DUST_COST_FORGE", cost)
    settings = get_settings()
    assert settings.starter_dust_balance == expected_balance
    assert settings.dust_cost_forge == expected_cost
    assert settings.starter_dust_balance >= 4 * settings.dust_cost_forge
