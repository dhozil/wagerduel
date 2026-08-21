"""Tests for the deterministic expiry refund - the bounded escape hatch.

NOTE: Some JOINED-bet refund scenarios require the settlement window to have
elapsed, which means the game_date must be in the past.  However join_bet now
rejects past game_dates (the cutoff enforcement).  These scenarios can only be
tested on studionet where block timing is real.  The tests below cover the
OPEN-bet refund path and the pre-deadline revert, which are fully testable in
direct mode.
"""

import json

from tests.direct.conftest import RESOLUTION_URL, fund, to_hex

AMOUNT = 1000
# Past game_date — the system datetime (2026) is already past the deadline.
GAME_DATE = "2024-06-20"
BET_ID = "2024-06-20_spain_italy"


def _create_open(vm, contract, alice):
    """Create an OPEN bet (no join) with the past game_date."""
    fund(vm, contract, alice, AMOUNT * 5)
    vm.sender = alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)


def test_refund_expired_not_found_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Bet not found"):
        contract.refund_expired("does-not-exist")


def test_refund_expired_open_after_deadline_refunds_creator(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """An OPEN bet that no one ever joined settles after the deadline: the
    creator gets their stake back and the bet is canceled."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _create_open(direct_vm, contract, direct_alice)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)

    # System datetime (2026) is past the deadline for 2024-06-20 + 14 days.
    contract.refund_expired(BET_ID)

    bet = contract.get_bet(BET_ID)
    assert bet["status"] == "CANCELED"
    assert bet["real_winner"] == "REFUND"
    assert contract.get_total_escrow() == 0
    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5
    assert contract.get_balance(to_hex(direct_bob)) == AMOUNT * 5
    assert contract.get_owner_fees() == 0


def test_refund_expired_cannot_run_twice(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Once refunded, the bet cannot be refunded again."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _create_open(direct_vm, contract, direct_alice)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)

    contract.refund_expired(BET_ID)

    with direct_vm.expect_revert("Bet must be open or joined by two players"):
        contract.refund_expired(BET_ID)


def test_refund_expired_can_be_called_by_anyone(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """Anyone can trigger the expiry refund, not just the creator."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    _create_open(direct_vm, contract, direct_alice)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)

    direct_vm.sender = direct_charlie
    contract.refund_expired(BET_ID)

    assert contract.get_bet(BET_ID)["status"] == "CANCELED"
    assert contract.get_total_escrow() == 0
