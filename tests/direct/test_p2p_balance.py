"""Tests for the on-chain balance wallet: deposit, user withdraw, owner fees."""

import json

from tests.direct.conftest import FIXTURES_MOCK_HTML, RESOLUTION_URL, fund, to_hex

AMOUNT = 1000
GAME_DATE = "2050-06-20"
BET_ID = "2050-06-20_spain_italy"


def test_deposit_increases_balance(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, 500)
    assert contract.get_balance(to_hex(direct_alice)) == 500

    fund(direct_vm, contract, direct_alice, 250)
    assert contract.get_balance(to_hex(direct_alice)) == 750


def test_deposit_zero_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    direct_vm.sender = direct_alice
    direct_vm.value = 0

    with direct_vm.expect_revert("Deposit must be greater than 0"):
        contract.deposit()


def test_user_withdraw(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, 1000)
    direct_vm.sender = direct_alice

    contract.withdraw(400)
    assert contract.get_balance(to_hex(direct_alice)) == 600


def test_user_withdraw_over_balance_reverts(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, 100)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Insufficient balance"):
        contract.withdraw(200)


def test_withdraw_zero_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, 100)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Withdraw amount must be greater than 0"):
        contract.withdraw(0)


def test_owner_fees_accumulate_and_withdraw(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    """Resolving a duel charges FEE_BPS on the pot; owner withdraws the fees."""
    contract = direct_deploy("contracts/p2p_gambling.py")

    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)

    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_bob
    contract.join_bet(BET_ID, "2")

    # Resolve: Spain (team 1) wins, creator Alice wins.
    # Pot = 2 * AMOUNT, fee = pot * FEE_BPS // 10000 = pot * 1%.
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

    pot = AMOUNT * 2
    fee = pot * 200 // 10000  # FEE_BPS = 200 (2%)
    payout = pot - fee

    # Winner balance = payout; owner_fees = fee
    assert contract.get_balance(to_hex(direct_alice)) == AMOUNT * 5 - AMOUNT + payout
    assert contract.get_balance(to_hex(direct_bob)) == AMOUNT * 5 - AMOUNT
    assert contract.get_owner_fees() == fee

    # Non-owner cannot withdraw fees
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only the contract owner can withdraw fees"):
        contract.withdraw_fees()

    # Owner withdraws the full accumulated fee
    direct_vm.sender = direct_owner
    contract.withdraw_fees()
    assert contract.get_owner_fees() == 0


def test_withdraw_fees_no_fees_reverts(direct_vm, direct_deploy, direct_owner):
    contract = direct_deploy("contracts/p2p_gambling.py")
    direct_vm.sender = direct_owner

    with direct_vm.expect_revert("No fees to withdraw"):
        contract.withdraw_fees()


def test_fee_minimum_one_wei(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    """Even a tiny pot pays at least 1 wei of fee (never bypassed by rounding)."""
    contract = direct_deploy("contracts/p2p_gambling.py")

    fund(direct_vm, contract, direct_alice, 10)
    fund(direct_vm, contract, direct_bob, 10)

    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Spain", "Italy", "1", RESOLUTION_URL, 1)

    direct_vm.sender = direct_bob
    contract.join_bet(BET_ID, "2")

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

    # pot = 2 wei; fee = max(2*200//10000, 1) = 1; payout = 1
    assert contract.get_owner_fees() == 1
    # Alice: 10 - 1(stake) + 1(payout) = 10
    assert contract.get_balance(to_hex(direct_alice)) == 10


def test_fee_invariant_over_two_duels(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_owner
):
    """Fees accumulate across all users/duels and drain on withdraw."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 10)
    fund(direct_vm, contract, direct_bob, AMOUNT * 10)

    def _resolve(bet_id, team1, team2, winner):
        direct_vm.sender = direct_alice
        direct_vm.clear_mocks()
        # Re-register fixture mocks for create_bet
        direct_vm.mock_web(r".*bbc\.com.*scores-fixtures.*", {
            "status": 200,
            "body": FIXTURES_MOCK_HTML,
        })
        direct_vm.mock_llm(
            r".*football fixture verifier.*",
            '{"valid": true}',
        )
        # Resolution mocks
        direct_vm.mock_web(
            r".*bbc\.com/sport/football/scores-fixtures.*",
            {"status": 200, "body": "Match result: 1:0. Winner: team 1."},
        )
        direct_vm.mock_llm(
            r".*match.result.*",
            json.dumps({"score": "1:0", "winner": winner}),
        )
        direct_vm.sender = direct_alice
        contract.create_bet(GAME_DATE, team1, team2, "1", RESOLUTION_URL, AMOUNT)
        direct_vm.sender = direct_bob
        contract.join_bet(bet_id, "2")
        direct_vm.sender = direct_alice
        contract.resolve_bet(bet_id)

    _resolve(BET_ID, "Spain", "Italy", 1)
    _resolve("2050-06-20_france_germany", "France", "Germany", 1)

    pot = AMOUNT * 2
    fee = pot * 200 // 10000
    assert contract.get_owner_fees() == fee * 2

    direct_vm.sender = direct_owner
    contract.withdraw_fees()
    assert contract.get_owner_fees() == 0
