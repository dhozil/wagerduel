"""Fund-conservation and adversarial-path tests (balance/escrow model).

Verifies escrow accounting stays consistent through every lifecycle transition
and that settled duels can never be paid, refunded, or drained again.
"""

import json
import re

from tests.direct.conftest import RESOLUTION_URL, fund, to_hex

AMOUNT = 1000
GAME_DATE = "2050-06-20"


def _bet_key():
    return f"{GAME_DATE}_spain_italy"


def _join(vm, contract, bob):
    fund(vm, contract, bob, AMOUNT * 5)
    vm.sender = bob
    contract.join_bet(_bet_key(), "2")


def _mock(vm, score, winner, url=RESOLUTION_URL):
    vm.mock_web(
        re.escape(url),
        {"status": 200, "body": f"Match result: {score}. Winner: team {winner}."},
    )
    vm.mock_llm(
        r".*match.result.*",
        json.dumps({"score": score, "winner": winner}),
    )


def _escrow_of(contract):
    bets = contract.get_bets()
    total = 0
    for b in bets.values():
        if b["status"] == "OPEN":
            total += b["amount"]
        elif b["status"] == "JOINED":
            total += b["amount"] * 2
    return total


def _fund_gap(contract, alice, bob, initial_alice, initial_bob):
    """(current balance sum) should fall below initial deposits by escrow + fees."""
    return contract.get_balance(to_hex(alice)) + contract.get_balance(to_hex(bob))


def test_escrow_conservation_invariant(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Contract escrow always equals the sum of open/joined stakes."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)

    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    contract.create_bet(GAME_DATE, "Denmark", "England", "0", RESOLUTION_URL, AMOUNT)

    assert _escrow_of(contract) == contract.get_total_escrow() == AMOUNT * 2

    _join(direct_vm, contract, direct_bob)
    assert _escrow_of(contract) == contract.get_total_escrow() == AMOUNT * 3


def test_resolve_drains_escrow_exactly(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    _join(direct_vm, contract, direct_bob)

    _mock(direct_vm, "1:0", 1)
    direct_vm.sender = direct_alice
    contract.resolve_bet(_bet_key())

    assert contract.get_total_escrow() == 0
    assert _escrow_of(contract) == 0


def test_cancel_drains_escrow_exactly(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    contract.cancel_bet(_bet_key())
    assert contract.get_total_escrow() == 0


def test_draw_refund_drains_escrow_exactly(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    _join(direct_vm, contract, direct_bob)

    _mock(direct_vm, "1:1", 0)
    direct_vm.sender = direct_alice
    contract.resolve_bet(_bet_key())

    assert contract.get_total_escrow() == 0
    assert contract.get_owner_fees() == 0


def test_one_time_settlement_guards(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """A settled duel can neither be refunded nor resolved again."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    _join(direct_vm, contract, direct_bob)

    _mock(direct_vm, "1:0", 1)
    direct_vm.sender = direct_alice
    contract.resolve_bet(_bet_key())

    with direct_vm.expect_revert("Only open bets can be canceled"):
        contract.cancel_bet(_bet_key())
    with direct_vm.expect_revert("Bet must be joined by two players to resolve"):
        contract.resolve_bet(_bet_key())

    # A canceled bet cannot be resolved or joined
    fund(direct_vm, contract, direct_alice, AMOUNT)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Denmark", "England", "1", RESOLUTION_URL, AMOUNT)
    contract.cancel_bet("2050-06-20_denmark_england")

    with direct_vm.expect_revert("Bet must be joined by two players to resolve"):
        contract.resolve_bet("2050-06-20_denmark_england")
    fund(direct_vm, contract, direct_bob, AMOUNT)
    with direct_vm.expect_revert("Bet is not open"):
        contract.join_bet("2050-06-20_denmark_england", "2")


def test_resolution_binds_to_stored_url(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Resolution fetches the creator-submitted URL, never a derived default."""
    custom_url = (
        "https://www.bbc.com/sport/football/scores-fixtures/2050-06-20?tab=results"
    )
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", custom_url, AMOUNT)
    direct_vm.sender = direct_bob
    contract.join_bet(_bet_key(), "2")

    _mock(direct_vm, "2:1", 1, url=custom_url)
    direct_vm.sender = direct_alice
    contract.resolve_bet(_bet_key())

    bet = contract.get_bet(_bet_key())
    assert bet["status"] == "RESOLVED"
    assert bet["resolution_url"] == custom_url
    assert bet["real_score"] == "2:1"


def test_owner_cannot_drain_active_escrow(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    """Withdraw_fees only ever moves accumulated fees - never player funds."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    _join(direct_vm, contract, direct_bob)

    # Escrow is locked; owner has no fees -> cannot withdraw anything
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("No fees to withdraw"):
        contract.withdraw_fees()

    # Escrow untouched
    assert contract.get_total_escrow() == AMOUNT * 2

    # Resolve pays the winner (minus fee); owner fees now positive and withdrawable
    _mock(direct_vm, "1:0", 1)
    direct_vm.sender = direct_alice
    contract.resolve_bet(_bet_key())
    assert contract.get_owner_fees() > 0

    direct_vm.sender = direct_owner
    contract.withdraw_fees()
    assert contract.get_owner_fees() == 0
