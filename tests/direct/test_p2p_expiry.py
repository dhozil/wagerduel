"""Tests for the deterministic expiry refund - the bounded escape hatch."""

import json

from tests.direct.conftest import RESOLUTION_URL, fund, to_hex

AMOUNT = 1000
GAME_DATE = "2024-06-20"
BET_ID = "2024-06-20_spain_italy"
# Match 2024-06-20 + 14-day window -> deadline 2024-07-04
BEFORE_DEADLINE = "2024-06-25T00:00:00+00:00"
AFTER_DEADLINE = "2024-08-01T00:00:00+00:00"


def _deploy_at(vm, direct_deploy, when):
    # datetime is injected at deploy time in direct mode, so warp before deploy.
    vm.warp(when)
    return direct_deploy("contracts/p2p_gambling.py")


def _joined(vm, contract, alice, bob):
    fund(vm, contract, alice, AMOUNT * 5)
    fund(vm, contract, bob, AMOUNT * 5)
    vm.sender = alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    vm.sender = bob
    contract.join_bet(BET_ID, "2")


def test_refund_expired_before_deadline_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy_at(direct_vm, direct_deploy, BEFORE_DEADLINE)
    _joined(direct_vm, contract, direct_alice, direct_bob)

    with direct_vm.expect_revert("Settlement deadline not reached yet"):
        contract.refund_expired(BET_ID)


def test_refund_expired_after_deadline(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy_at(direct_vm, direct_deploy, AFTER_DEADLINE)
    _joined(direct_vm, contract, direct_alice, direct_bob)

    contract.refund_expired(BET_ID)

    bet = contract.get_bet(BET_ID)
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "REFUND"
    assert bet["winner"] == "0x0000000000000000000000000000000000000000"
    assert contract.get_total_escrow() == 0
    # Both players' stakes returned to their balances (no fee on refund)
    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5
    assert contract.get_balance(to_hex(direct_bob)) == AMOUNT * 5
    assert contract.get_owner_fees() == 0


def test_refund_expired_can_be_called_by_anyone(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy_at(direct_vm, direct_deploy, AFTER_DEADLINE)
    _joined(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    contract.refund_expired(BET_ID)

    assert contract.get_bet(BET_ID)["status"] == "RESOLVED"
    assert contract.get_total_escrow() == 0


def test_refund_expired_open_before_deadline_reverts(
    direct_vm, direct_deploy, direct_alice
):
    contract = _deploy_at(direct_vm, direct_deploy, BEFORE_DEADLINE)
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    with direct_vm.expect_revert("Settlement deadline not reached yet"):
        contract.refund_expired(BET_ID)


def test_refund_expired_open_after_deadline_refunds_creator(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """An OPEN bet that no one ever joined settles after the deadline: the
    creator gets their stake back and the bet is canceled instead of
    lingering (or being joinable) forever."""
    contract = _deploy_at(direct_vm, direct_deploy, AFTER_DEADLINE)
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    # Anyone can trigger the expiry refund; the creator gets the stake back.
    contract.refund_expired(BET_ID)

    bet = contract.get_bet(BET_ID)
    assert bet["status"] == "CANCELED"
    assert bet["real_winner"] == "REFUND"
    assert contract.get_total_escrow() == 0
    # Creator's stake returned (no fee on refund), opponent untouched.
    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5
    assert contract.get_balance(to_hex(direct_bob)) == AMOUNT * 5
    assert contract.get_owner_fees() == 0


def test_refund_expired_not_found_reverts(direct_vm, direct_deploy, direct_alice):
    contract = _deploy_at(direct_vm, direct_deploy, AFTER_DEADLINE)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Bet not found"):
        contract.refund_expired("does-not-exist")


def test_refund_expired_cannot_run_twice(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy_at(direct_vm, direct_deploy, AFTER_DEADLINE)
    _joined(direct_vm, contract, direct_alice, direct_bob)

    contract.refund_expired(BET_ID)

    with direct_vm.expect_revert("Bet must be open or joined by two players"):
        contract.refund_expired(BET_ID)


def test_resolve_still_works_after_deadline(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """The AI-verified path remains available after the deadline - winner paid."""
    contract = _deploy_at(direct_vm, direct_deploy, AFTER_DEADLINE)
    _joined(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.mock_web(
        r".*bbc\.com/sport/football/scores-fixtures.*",
        {"status": 200, "body": "Match result: 1:0. Winner: team 1."},
    )
    direct_vm.mock_llm(
        r".*match.result.*",
        json.dumps({"score": "1:0", "winner": 1}),
    )

    direct_vm.sender = direct_alice
    contract.resolve_bet(BET_ID)

    bet = contract.get_bet(BET_ID)
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "1"
    assert contract.get_total_escrow() == 0
