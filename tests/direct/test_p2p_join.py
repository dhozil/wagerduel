"""Tests for joining bets - the opponent funds from their on-chain balance."""

from tests.direct.conftest import RESOLUTION_URL, fund

AMOUNT = 1000


def _setup(vm, contract, alice, bob):
    fund(vm, contract, alice, AMOUNT * 5)
    fund(vm, contract, bob, AMOUNT * 5)
    vm.sender = alice
    contract.create_bet("2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)


def test_join_bet(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _setup(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.join_bet("2024-06-20_spain_italy", "2")

    bet = contract.get_bet("2024-06-20_spain_italy")
    assert bet["status"] == "JOINED"
    assert bet["opponent_side"] == "2"
    assert bet["opponent"] != bet["creator"]
    assert contract.get_total_escrow() == AMOUNT * 2


def test_join_bet_same_side_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    _setup(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Must bet on the opposite outcome"):
        contract.join_bet("2024-06-20_spain_italy", "1")


def test_join_bet_creator_cannot_join(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    with direct_vm.expect_revert("Cannot join your own bet"):
        contract.join_bet("2024-06-20_spain_italy", "2")


def test_join_bet_insufficient_balance_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, 100)
    direct_vm.sender = direct_alice
    contract.create_bet("2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Insufficient balance"):
        contract.join_bet("2024-06-20_spain_italy", "2")


def test_join_bet_not_found_reverts(direct_vm, direct_deploy, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Bet not found"):
        contract.join_bet("2024-06-20_spain_italy", "2")


def test_join_bet_closed_bet_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    fund(direct_vm, contract, direct_charlie, AMOUNT * 5)

    direct_vm.sender = direct_alice
    contract.create_bet("2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_bob
    contract.join_bet("2024-06-20_spain_italy", "2")

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Bet is not open"):
        contract.join_bet("2024-06-20_spain_italy", "1")


def test_join_bet_draw_side(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2024-06-20", "Denmark", "England", "0", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_bob
    contract.join_bet("2024-06-20_denmark_england", "1")

    bet = contract.get_bet("2024-06-20_denmark_england")
    assert bet["status"] == "JOINED"
    assert bet["opponent_side"] == "1"


def test_owner_cannot_join_bet(
    direct_vm, direct_deploy, direct_alice, direct_owner
):
    """The deployer can never participate as an opponent either."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_owner, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("Owner cannot place bets"):
        contract.join_bet("2024-06-20_spain_italy", "2")
