"""Tests for bet resolution - AI/web verified winner determination + fees."""

import json

from tests.direct.conftest import RESOLUTION_URL, fund, to_hex

AMOUNT = 1000
GAME_DATE = "2050-06-20"


def _bet_key():
    return f"{GAME_DATE}_spain_italy"


def _joined(vm, contract, alice, bob, creator_side="1", opp_side="2", amount=AMOUNT):
    fund(vm, contract, alice, amount * 5)
    fund(vm, contract, bob, amount * 5)
    vm.sender = alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", creator_side, RESOLUTION_URL, amount)
    vm.sender = bob
    contract.join_bet(_bet_key(), opp_side)


def _mock(vm, score, winner):
    vm.mock_web(
        r".*bbc\.com/sport/football/scores-fixtures.*",
        {"status": 200, "body": f"Match result: {score}. Winner: team {winner}."},
    )
    vm.mock_llm(
        r".*match.result.*",
        json.dumps({"score": score, "winner": winner}),
    )


def _expected_payout(amount):
    pot = amount * 2
    fee = pot * 200 // 10000  # FEE_BPS = 200 (2%) (1%)
    return pot - fee


def test_resolve_creator_wins(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)
    _mock(direct_vm, "1:0", 1)

    contract.resolve_bet(_bet_key())

    bet = contract.get_bet(_bet_key())
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "1"
    assert bet["real_score"] == "1:0"
    assert bet["winner"] == to_hex(direct_alice)
    assert contract.get_total_escrow() == 0

    # Alice: 5*AMOUNT - AMOUNT(stake) + payout
    assert contract.get_balance(to_hex(direct_alice)) == (
        AMOUNT * 5 - AMOUNT + _expected_payout(AMOUNT)
    )
    assert contract.get_balance(to_hex(direct_bob)) == AMOUNT * 5 - AMOUNT


def test_resolve_opponent_wins(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)
    _mock(direct_vm, "0:2", 2)

    contract.resolve_bet(_bet_key())

    bet = contract.get_bet(_bet_key())
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "2"
    assert bet["winner"] == to_hex(direct_bob)
    assert contract.get_balance(to_hex(direct_bob)) == (
        AMOUNT * 5 - AMOUNT + _expected_payout(AMOUNT)
    )
    assert contract.get_total_escrow() == 0


def test_resolve_draw_picked_by_creator(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Denmark", "England", "0", RESOLUTION_URL, AMOUNT)
    direct_vm.sender = direct_bob
    contract.join_bet("2050-06-20_denmark_england", "1")

    # Draw -> creator picked "0", so creator wins
    _mock(direct_vm, "1:1", 0)
    contract.resolve_bet("2050-06-20_denmark_england")

    bet = contract.get_bet("2050-06-20_denmark_england")
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "0"
    assert bet["winner"] == to_hex(direct_alice)
    assert contract.get_total_escrow() == 0


def test_resolve_draw_refunds_both(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)

    # Neither player picked the draw side -> tie, both refunded, no fee
    _mock(direct_vm, "1:1", 0)
    contract.resolve_bet(_bet_key())

    bet = contract.get_bet(_bet_key())
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "0"
    assert bet["winner"] == "0x0000000000000000000000000000000000000000"
    assert contract.get_total_escrow() == 0
    assert contract.get_owner_fees() == 0  # no fee on a refund
    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5
    assert contract.get_balance(to_hex(direct_bob)) == AMOUNT * 5


def test_resolve_unfinished_match_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)
    _mock(direct_vm, "-", -1)

    with direct_vm.expect_revert("Match not finished"):
        contract.resolve_bet(_bet_key())


def test_resolve_unjoined_bet_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    with direct_vm.expect_revert("Bet must be joined by two players to resolve"):
        contract.resolve_bet(_bet_key())


def test_resolve_not_found_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Bet not found"):
        contract.resolve_bet(_bet_key())


def test_resolve_twice_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)
    _mock(direct_vm, "1:0", 1)

    contract.resolve_bet(_bet_key())

    with direct_vm.expect_revert("Bet must be joined by two players to resolve"):
        contract.resolve_bet(_bet_key())


def test_resolve_by_third_party(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)
    _mock(direct_vm, "1:0", 1)

    # Anyone can trigger resolution - payouts are deterministic
    direct_vm.sender = direct_bob
    contract.resolve_bet(_bet_key())

    bet = contract.get_bet(_bet_key())
    assert bet["winner"] == to_hex(direct_alice)


def test_validator_accepts_matching_evidence(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Validator independently re-runs the task; agreeing evidence is accepted."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)
    _mock(direct_vm, "2:1", 1)

    contract.resolve_bet(_bet_key())

    assert direct_vm.run_validator() is True


def test_validator_rejects_contradicting_evidence(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Validator must reject when the leader's claim contradicts its own fetch."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob)

    _mock(direct_vm, "2:1", 1)
    contract.resolve_bet(_bet_key())

    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r".*bbc\.com/sport/football/scores-fixtures.*",
        {"status": 200, "body": "Match result: 0:2. Winner: team 2."},
    )
    direct_vm.mock_llm(
        r".*match.result.*",
        json.dumps({"score": "0:2", "winner": 2}),
    )

    assert direct_vm.run_validator() is False
