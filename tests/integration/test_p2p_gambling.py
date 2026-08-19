"""Integration tests for WagerDuel - require a GenLayer backend running.

Run with: gltest tests/integration/ -v -s --network <localnet|studionet>

The contract is deployed ONCE (session-scoped fixture) and all tests exercise
that single instance with two player accounts:

- default_account = contract OWNER (can never bet)
- accounts[1]     = Alice (player A)
- accounts[2]     = Bob   (player B)

The suite is fully deterministic: it uses NO web/LLM or datetime simulation,
because hosted networks do not honour those overrides for real transactions
(they stay "proposing" forever). resolve_bet is therefore covered on-chain by
`deploy/smoke_test_deployed.py --resolve` (real web + AI validators) and its
logic by the mocked direct tests in tests/direct/.

Every test asserts cumulative-state Deltas, so it is order-independent and a
fresh per-test deploy is never needed. Bet ids are unique per test because a
match can only host one open bet.
"""

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

from tests.integration.fixtures import (
    AMOUNT,
    RESOLUTION_URL,
    open_bet_state,
    joined_bet_state,
)


@pytest.fixture(scope="session")
def contract():
    factory = get_contract_factory("P2PGambling")
    deployed = factory.deploy()
    assert deployed.get_bets(args=[]).call() == {}
    assert deployed.get_total_escrow(args=[]).call() == 0
    return deployed


def _deposit(c, account, amount, wait_interval=3000, wait_retries=120):
    return c.connect(account).deposit(args=[]).transact(
        value=amount, wait_interval=wait_interval, wait_retries=wait_retries
    )


def _snapshot(contract, alice, bob):
    return {
        "alice": contract.get_balance(args=[alice]).call(),
        "bob": contract.get_balance(args=[bob]).call(),
        "escrow": contract.get_total_escrow(args=[]).call(),
        "fees": contract.get_owner_fees(args=[]).call(),
    }


@pytest.mark.integration
def test_p2p_contract_schema(contract):
    methods = contract._schema["methods"]
    for m in [
        "deposit",
        "withdraw",
        "create_bet",
        "join_bet",
        "resolve_bet",
        "cancel_bet",
        "refund_expired",
        "withdraw_fees",
        "get_balance",
        "get_owner_fees",
        "get_bet",
        "get_bets",
        "get_total_escrow",
        "get_owner",
    ]:
        assert m in methods, f"missing method {m}"
    assert contract.get_owner(args=[]).call() is not None


@pytest.mark.integration
def test_p2p_deposit_and_create_with_escrow(contract, default_account, accounts):
    bet_id = "2024-06-20_england_france"
    alice = accounts[1].address
    before = _snapshot(contract, accounts[1].address, accounts[2].address)

    assert tx_execution_succeeded(_deposit(contract, accounts[1], AMOUNT * 10))

    create = contract.connect(accounts[1]).create_bet(
        args=["2024-06-20", "England", "France", "1", RESOLUTION_URL, AMOUNT],
    ).transact()
    assert tx_execution_succeeded(create)

    after = _snapshot(contract, accounts[1].address, accounts[2].address)
    assert contract.get_bet(args=[bet_id]).call() == open_bet_state(
        alice, bet_id, team1="England", team2="France"
    )
    assert after["escrow"] == before["escrow"] + AMOUNT
    assert after["alice"] == before["alice"] + AMOUNT * 10 - AMOUNT

    # Untrusted source is rejected (no state change)
    bad = contract.connect(accounts[1]).create_bet(
        args=["2024-06-20", "England", "France", "1", "https://example.com/x", AMOUNT],
    ).transact()
    assert not tx_execution_succeeded(bad)


@pytest.mark.integration
def test_p2p_join_and_duplicate_join_rejected(contract, default_account, accounts):
    bet_id = "2024-06-21_germany_portugal"
    alice = accounts[1]
    bob = accounts[2]
    before = _snapshot(contract, alice.address, bob.address)

    assert tx_execution_succeeded(_deposit(contract, alice, AMOUNT * 10))
    assert tx_execution_succeeded(_deposit(contract, bob, AMOUNT * 10))

    assert tx_execution_succeeded(contract.connect(alice).create_bet(
        args=["2024-06-21", "Germany", "Portugal", "1", RESOLUTION_URL, AMOUNT],
    ).transact())

    bob_contract = contract.connect(bob)
    join = bob_contract.join_bet(args=[bet_id, "2"]).transact()
    assert tx_execution_succeeded(join)

    assert contract.get_bet(args=[bet_id]).call() == joined_bet_state(
        alice.address, bob.address, bet_id, team1="Germany", team2="Portugal"
    )
    after = _snapshot(contract, alice.address, bob.address)
    assert after["escrow"] == before["escrow"] + AMOUNT * 2
    assert after["bob"] == before["bob"] + AMOUNT * 10 - AMOUNT

    # Third player cannot join anymore (not OPEN)
    third = contract.connect(accounts[2])
    dup = third.join_bet(args=[bet_id, "2"]).transact()
    assert not tx_execution_succeeded(dup)


@pytest.mark.integration
def test_p2p_withdraw_and_views(contract, default_account, accounts):
    alice = accounts[1]
    before = _snapshot(contract, alice.address, accounts[2].address)

    assert tx_execution_succeeded(_deposit(contract, alice, AMOUNT * 10))
    assert contract.get_balance(args=[alice.address]).call() == (
        before["alice"] + AMOUNT * 10
    )

    wd = contract.connect(alice).withdraw(args=[AMOUNT]).transact()
    assert tx_execution_succeeded(wd)
    assert contract.get_balance(args=[alice.address]).call() == (
        before["alice"] + AMOUNT * 9
    )

    # Views expose aggregated escrow/fees/bets consistently
    assert contract.get_owner_fees(args=[]).call() == before["fees"]
    all_bets = contract.get_bets(args=[]).call()
    assert isinstance(all_bets, dict)
    for bet in all_bets.values():
        assert bet["status"] in ("OPEN", "JOINED", "RESOLVED", "CANCELED")


@pytest.mark.integration
def test_p2p_cancel_refunds_open_bet(contract, default_account, accounts):
    bet_id = "2024-06-30_sweden_norway"
    alice = accounts[1]
    before = _snapshot(contract, alice.address, accounts[2].address)

    assert tx_execution_succeeded(_deposit(contract, alice, AMOUNT * 5))
    assert tx_execution_succeeded(contract.connect(alice).create_bet(
        args=["2024-06-30", "Sweden", "Norway", "2", RESOLUTION_URL, AMOUNT]
    ).transact())
    mid = _snapshot(contract, alice.address, accounts[2].address)
    assert mid["escrow"] == before["escrow"] + AMOUNT
    assert mid["alice"] == before["alice"] + AMOUNT * 5 - AMOUNT

    cancel = contract.connect(alice).cancel_bet(args=[bet_id]).transact()
    assert tx_execution_succeeded(cancel)

    after = _snapshot(contract, alice.address, accounts[2].address)
    bet = contract.get_bet(args=[bet_id]).call()
    assert bet["status"] == "CANCELED"
    assert after["escrow"] == before["escrow"]
    assert after["alice"] == before["alice"] + AMOUNT * 5

    # Only the creator can cancel, and only while OPEN
    assert not tx_execution_succeeded(contract.cancel_bet(args=[bet_id]).transact())


@pytest.mark.integration
def test_p2p_expiry_refund(contract, default_account, accounts):
    """After the settlement deadline, refund_expired returns both stakes."""
    bet_id = "2024-06-23_netherlands_belgium"
    alice = accounts[1]
    bob = accounts[2]
    before = _snapshot(contract, alice.address, bob.address)

    assert tx_execution_succeeded(_deposit(contract, alice, AMOUNT * 10))
    assert tx_execution_succeeded(_deposit(contract, bob, AMOUNT * 10))
    assert tx_execution_succeeded(contract.connect(alice).create_bet(
        args=["2024-06-23", "Netherlands", "Belgium", "1", RESOLUTION_URL, AMOUNT]
    ).transact())
    bob_contract = contract.connect(bob)
    assert tx_execution_succeeded(bob_contract.join_bet(args=[bet_id, "2"]).transact())

    refund = contract.refund_expired(args=[bet_id]).transact(
        wait_interval=3000,
        wait_retries=120,
    )
    assert tx_execution_succeeded(refund)

    bet = contract.get_bet(args=[bet_id]).call()
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "REFUND"

    after = _snapshot(contract, alice.address, bob.address)
    assert after["escrow"] == before["escrow"]  # stakes fully returned
    assert after["fees"] == before["fees"]  # no fee on refund


@pytest.mark.integration
def test_p2p_handicap_create_and_join(contract, default_account, accounts):
    """Handicap is stored on-chain and exposed via get_bet."""
    bet_id = "2024-06-24_mexico_poland"
    alice = accounts[1].address
    bob = accounts[2]

    assert tx_execution_succeeded(_deposit(contract, accounts[1], AMOUNT * 10))
    assert tx_execution_succeeded(_deposit(contract, bob, AMOUNT * 10))

    create = contract.connect(accounts[1]).create_bet(
        args=["2024-06-24", "Mexico", "Poland", "1", RESOLUTION_URL, AMOUNT, 2],
    ).transact()
    assert tx_execution_succeeded(create)

    assert contract.get_bet(args=[bet_id]).call() == open_bet_state(
        alice, bet_id, 2, team1="Mexico", team2="Poland"
    )

    join = contract.connect(bob).join_bet(args=[bet_id, "2"]).transact()
    assert tx_execution_succeeded(join)
    assert contract.get_bet(args=[bet_id]).call()["status"] == "JOINED"


@pytest.mark.integration
def test_p2p_handicap_draw_side_and_range_rejected(contract, default_account, accounts):
    """Draw side with handicap and out-of-range handicap both revert."""
    alice = accounts[1]
    assert tx_execution_succeeded(_deposit(contract, alice, AMOUNT * 20))

    # Draw side + handicap -> revert
    draw_bad = contract.connect(alice).create_bet(
        args=["2024-06-25", "Egypt", "Ghana", "0", RESOLUTION_URL, AMOUNT, 2],
    ).transact()
    assert not tx_execution_succeeded(draw_bad)

    # Out-of-range handicap -> revert
    range_bad = contract.connect(alice).create_bet(
        args=["2024-06-26", "Nigeria", "Cameroon", "1", RESOLUTION_URL, AMOUNT, 5],
    ).transact()
    assert not tx_execution_succeeded(range_bad)

    # Negative handicap is allowed and stored correctly (Team 1 gets the voor)
    negative_ok = contract.connect(alice).create_bet(
        args=["2024-06-27", "Ecuador", "Chile", "1", RESOLUTION_URL, AMOUNT, -2],
    ).transact()
    assert tx_execution_succeeded(negative_ok)
    assert contract.get_bet(args=["2024-06-27_ecuador_chile"]).call()[
        "handicap_halves"
    ] == -2