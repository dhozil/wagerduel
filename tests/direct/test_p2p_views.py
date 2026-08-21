"""Tests for read-only view methods."""

from tests.direct.conftest import RESOLUTION_URL, fund, to_hex

AMOUNT = 1000


def test_empty_bets(direct_deploy):
    contract = direct_deploy("contracts/p2p_gambling.py")
    assert contract.get_bets() == {}
    assert contract.get_total_escrow() == 0
    assert contract.get_owner_fees() == 0


def test_get_bet_not_found(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Bet not found"):
        contract.get_bet("nonexistent")


def test_get_bets_after_create(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    bets = contract.get_bets()
    assert "2050-06-20_spain_italy" in bets
    assert bets["2050-06-20_spain_italy"]["team1"] == "Spain"
    assert bets["2050-06-20_spain_italy"]["creator_side"] == "1"
    assert bets["2050-06-20_spain_italy"]["status"] == "OPEN"
    assert len(bets) == 1


def test_get_balance_default_zero(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    direct_vm.sender = direct_alice
    assert contract.get_balance(to_hex(direct_alice)) == 0


def test_get_balance_after_deposit(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, 1234)
    assert contract.get_balance(to_hex(direct_alice)) == 1234


def test_get_owner(direct_vm, direct_deploy, direct_owner):
    contract = direct_deploy("contracts/p2p_gambling.py")
    assert contract.get_owner() == to_hex(direct_owner)


def test_view_does_not_change_state(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet("2050-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    contract.get_bets()
    contract.get_total_escrow()
    contract.get_balance(to_hex(direct_alice))
    contract.get_owner_fees()
    contract.get_owner()
    contract.get_bet("2050-06-20_spain_italy")

    assert contract.get_total_escrow() == AMOUNT
    assert contract.get_bet("2050-06-20_spain_italy")["status"] == "OPEN"
