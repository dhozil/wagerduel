"""Tests for the handicap (voor) feature - fair stakes for mismatched teams."""

import json

from tests.direct.conftest import RESOLUTION_URL, fund, to_hex

AMOUNT = 1000
GAME_DATE = "2050-06-20"


def _joined(
    vm,
    contract,
    alice,
    bob,
    creator_side="1",
    opp_side="2",
    amount=AMOUNT,
    team1="Spain",
    team2="Italy",
    handicap_halves=0,
):
    fund(vm, contract, alice, amount * 5)
    fund(vm, contract, bob, amount * 5)
    vm.sender = alice
    contract.create_bet(
        GAME_DATE,
        team1,
        team2,
        creator_side,
        RESOLUTION_URL,
        amount,
        handicap_halves,
    )
    vm.sender = bob
    contract.join_bet(f"{GAME_DATE}_{team1.lower()}_{team2.lower()}", opp_side)


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
    fee = pot * 200 // 10000
    return pot - fee


def test_handicap_makes_win_a_draw_refund_both(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Barca 2-1 Leeds with Leeds +1 -> adjusted 2-2 -> draw, both refunded."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob, handicap_halves=2)
    _mock(direct_vm, "2:1", 1)

    contract.resolve_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "0"
    assert bet["winner"] == "0x0000000000000000000000000000000000000000"
    assert contract.get_total_escrow() == 0
    assert contract.get_owner_fees() == 0
    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5
    assert contract.get_balance(to_hex(direct_bob)) == AMOUNT * 5


def test_handicap_creator_still_wins_when_covering(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Barca 3-0 with Leeds +1 -> adjusted 3-1 -> creator (Team 1) wins."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob, handicap_halves=2)
    _mock(direct_vm, "3:0", 1)

    contract.resolve_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["real_winner"] == "1"
    assert bet["winner"] == to_hex(direct_alice)
    assert contract.get_balance(to_hex(direct_alice)) == (
        AMOUNT * 5 - AMOUNT + _expected_payout(AMOUNT)
    )


def test_handicap_flips_winner_to_opponent(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Leeds +2 beats Barca 0-1 -> adjusted 0-3 -> opponent (Team 2) wins."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob, handicap_halves=4)
    _mock(direct_vm, "0:1", 2)

    contract.resolve_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["real_winner"] == "2"
    assert bet["winner"] == to_hex(direct_bob)
    assert contract.get_balance(to_hex(direct_bob)) == (
        AMOUNT * 5 - AMOUNT + _expected_payout(AMOUNT)
    )


def test_handicap_half_goal_creator_wins(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Leeds +0.5, Barca wins 2-1 -> adjusted 2-1.5 -> Team 1 still wins."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob, handicap_halves=1)
    _mock(direct_vm, "2:1", 1)

    contract.resolve_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["real_winner"] == "1"
    assert bet["winner"] == to_hex(direct_alice)


def test_handicap_half_goal_opponent_wins(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Leeds +0.5, 1-1 -> adjusted 1-1.5 -> Team 2 (opponent) wins."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob, handicap_halves=1)
    _mock(direct_vm, "1:1", 0)

    contract.resolve_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["real_winner"] == "2"
    assert bet["winner"] == to_hex(direct_bob)


def test_handicap_to_team1_via_negative_halves(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Creator backs Team 2 but gives Team 1 +1 (handicap -2 halves)."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(
        direct_vm,
        contract,
        direct_alice,
        direct_bob,
        creator_side="2",
        opp_side="1",
        handicap_halves=-2,
    )
    # Real 1-1, adjusted Team 1 (1+1) 2 vs Team 2 1 -> Team 1 (opponent) wins.
    _mock(direct_vm, "1:1", 0)

    contract.resolve_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["real_winner"] == "1"
    assert bet["winner"] == to_hex(direct_bob)
    assert contract.get_balance(to_hex(direct_bob)) == (
        AMOUNT * 5 - AMOUNT + _expected_payout(AMOUNT)
    )


def test_handicap_zero_uses_verified_verdict(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Without a handicap, the LLM-verified winner is used unchanged."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _joined(direct_vm, contract, direct_alice, direct_bob, handicap_halves=0)
    _mock(direct_vm, "2:1", 1)

    contract.resolve_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["real_winner"] == "1"
    assert bet["winner"] == to_hex(direct_alice)


def test_handicap_team2_draw_side_reverts(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Handicap is only available for team bets"):
        contract.create_bet(
            GAME_DATE, "Denmark", "England", "0", RESOLUTION_URL, AMOUNT, 2
        )


def test_handicap_out_of_range_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Handicap must be between -2 and +2 goals"):
        contract.create_bet(
            GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT, 5
        )


def test_get_bet_exposes_handicap(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT, 2)

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["handicap_halves"] == 2