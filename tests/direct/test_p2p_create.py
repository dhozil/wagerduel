"""Tests for bet creation from on-chain balance (escrow model)."""

import pytest

from tests.direct.conftest import FIXTURES_MOCK_HTML, RESOLUTION_URL, fund

AMOUNT = 1000


def _ready(vm, contract, alice, balance=AMOUNT * 5):
    fund(vm, contract, alice, balance)


def test_create_bet(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["team1"] == "Spain"
    assert bet["team2"] == "Italy"
    assert bet["creator_side"] == "1"
    assert bet["opponent_side"] == ""
    assert bet["amount"] == AMOUNT
    assert bet["status"] == "OPEN"
    assert bet["real_winner"] == ""
    assert bet["real_score"] == ""
    assert bet["resolution_url"] == RESOLUTION_URL
    assert contract.get_total_escrow() == AMOUNT
    # Stake moved from creator balance to escrow
    from tests.direct.conftest import to_hex

    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5 - AMOUNT


def test_create_bet_insufficient_balance_reverts(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, 100)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Insufficient balance"):
        contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)


def test_create_bet_zero_amount_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Bet amount must be greater than 0"):
        contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, 0)


def test_create_bet_invalid_side_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Side must be '1', '2', or '0'"):
        contract.create_bet("2050-06-20", "Spain", "Italy", "3", RESOLUTION_URL, AMOUNT)


def test_create_bet_duplicate_match_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    with direct_vm.expect_revert("A bet for this match already exists"):
        contract.create_bet("2050-06-20", "Spain", "Italy", "2", RESOLUTION_URL, AMOUNT)


def test_create_bet_draw_side_allowed(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    contract.create_bet("2050-06-20", "Denmark", "England", "0", RESOLUTION_URL, AMOUNT)

    bet = contract.get_bet("2050-06-20_denmark_england")
    assert bet["creator_side"] == "0"
    assert bet["status"] == "OPEN"


def test_create_bet_empty_team_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Team names must be distinct and non-empty"):
        contract.create_bet("2050-06-20", "Spain", "Spain", "1", RESOLUTION_URL, AMOUNT)


def test_total_escrow_accumulates(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice

    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    contract.create_bet("2050-06-20", "Denmark", "England", "0", RESOLUTION_URL, AMOUNT)

    assert contract.get_total_escrow() == AMOUNT * 2


def test_create_bet_invalid_url_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Resolution URL must use a trusted source"):
        contract.create_bet("2050-06-20", "Spain", "Italy", "1", "not-a-url", AMOUNT)


def test_create_bet_untrusted_host_reverts(direct_vm, direct_deploy, direct_alice):
    """Only whitelisted hosts (BBC, ESPN, ...) are accepted as the source."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Resolution URL must use a trusted source"):
        contract.create_bet(
            "2050-06-20",
            "Spain",
            "Italy",
            "1",
            "https://example.com/scores/spain-vs-italy",
            AMOUNT,
        )


def test_create_bet_spoofed_host_reverts(direct_vm, direct_deploy, direct_alice):
    """Lookalike hostnames must not bypass the allowlist."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Resolution URL must use a trusted source"):
        contract.create_bet(
            "2050-06-20",
            "Spain",
            "Italy",
            "1",
            "https://www.bbc.com.evil.com/scores",
            AMOUNT,
        )


def test_create_bet_trusted_espn_url_accepted(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    contract.create_bet(
        "2050-06-20",
        "Spain",
        "Italy",
        "1",
        "https://www.espn.com/soccer/match/_/gameId/12345",
        AMOUNT,
    )
    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["resolution_url"] == "https://www.espn.com/soccer/match/_/gameId/12345"


def test_create_bet_trusted_bbc_uk_url_accepted(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    contract.create_bet(
        "2050-06-20",
        "Spain",
        "Italy",
        "1",
        "https://www.bbc.co.uk/sport/football/scores-fixtures/2050-06-20",
        AMOUNT,
    )
    bet = contract.get_bet("2050-06-20_spain_italy")
    assert "bbc.co.uk" in bet["resolution_url"]


def test_create_bet_keeps_creator_provided_url(direct_vm, direct_deploy, direct_alice):
    """The source URL is stored verbatim - never derived or swapped."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    custom_url = (
        "https://www.bbc.com/sport/football/scores-fixtures/2050-06-20?tab=results"
    )
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", custom_url, AMOUNT)

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["resolution_url"] == custom_url


def test_owner_cannot_create_bet(direct_vm, direct_deploy, direct_owner):
    """The deployer must never be a bettor - removes any conflict-of-interest."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_owner, AMOUNT * 5)
    direct_vm.sender = direct_owner

    with direct_vm.expect_revert("Owner cannot place bets"):
        contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)


def test_create_bet_fake_teams_reverts(direct_vm, direct_deploy, direct_alice):
    """Bets with team names not found in fixtures are rejected."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    # Override autouse mocks: clear all, then re-register with valid=false
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*bbc\.com.*scores-fixtures.*", {
        "status": 200,
        "body": FIXTURES_MOCK_HTML,
    })
    direct_vm.mock_llm(
        r".*football fixture verifier.*",
        '{"valid": false}',
    )

    with direct_vm.expect_revert("Teams not found in fixtures for this date"):
        contract.create_bet(
            "2050-06-20", "FakeTeamX", "FakeTeamY", "1", RESOLUTION_URL, AMOUNT
        )


def test_create_bet_past_date_reverts(direct_vm, direct_deploy, direct_alice):
    """Bets with past game dates are rejected to prevent spam."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Game date must not be in the past"):
        contract.create_bet("2020-01-01", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)


def test_create_bet_invalid_date_format_reverts(direct_vm, direct_deploy, direct_alice):
    """Bets with invalid date format are rejected."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _ready(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Game date must be in YYYY-MM-DD format"):
        contract.create_bet("not-a-date", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
