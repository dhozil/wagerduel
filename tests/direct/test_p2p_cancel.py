"""Tests for bet cancellation - creator's stake returns to their balance."""

from tests.direct.conftest import RESOLUTION_URL, fund, to_hex

AMOUNT = 1000


def test_cancel_open_bet(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    contract.cancel_bet("2050-06-20_spain_italy")

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["status"] == "CANCELED"
    assert contract.get_total_escrow() == 0
    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5


def test_cancel_joined_bet_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    direct_vm.sender = direct_bob
    contract.join_bet("2050-06-20_spain_italy", "2")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only open bets can be canceled"):
        contract.cancel_bet("2050-06-20_spain_italy")


def test_cancel_by_non_creator_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the creator can cancel the bet"):
        contract.cancel_bet("2050-06-20_spain_italy")


def test_cancel_not_found_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Bet not found"):
        contract.cancel_bet("2050-06-20_spain_italy")


def test_recreate_same_match_after_cancel(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)

    direct_vm.sender = direct_alice
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)
    contract.cancel_bet("2050-06-20_spain_italy")

    direct_vm.sender = direct_bob
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    bet = contract.get_bet("2050-06-20_spain_italy")
    assert bet["status"] == "OPEN"
    assert bet["creator"] != "0x0000000000000000000000000000000000000000"
