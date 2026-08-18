"""Integration tests for WagerDuel - require a GenLayer backend running.

Run with: gltest tests/integration/ -v -s --network <localnet|studionet>

Covers the balance/escrow model: deposit -> create -> join -> resolve (fees)
-> cancel -> expiry refund, plus user withdrawal and owner fee withdrawal.
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

BET_ID = "2024-06-20_spain_italy"


def _resolve_context(score: str, winner: int) -> dict:
    return {
        "validators": [
            {
                "stake": 1,
                "provider": "glsim",
                "model": "direct",
                "config": {},
                "plugin": "glsim",
                "plugin_config": {
                    "mock_web_response": {
                        "nondet_web_request": {
                            RESOLUTION_URL: {
                                "status": 200,
                                "body": (
                                    f"Match result: {score}. Winner: team {winner}."
                                ),
                            }
                        }
                    },
                    "mock_response": {
                        "response": {
                            r".*match.result.*": (
                                '{"score": "%s", "winner": %d}' % (score, winner)
                            )
                        }
                    },
                },
            }
        ]
    }


def _deploy():
    factory = get_contract_factory("P2PGambling")
    contract = factory.deploy()
    assert contract.get_bets(args=[]).call() == {}
    assert contract.get_total_escrow(args=[]).call() == 0
    return contract


def _deposit(contract, amount, wait_interval=10000, wait_retries=30):
    return contract.deposit(args=[]).transact(
        value=amount, wait_interval=wait_interval, wait_retries=wait_retries
    )


def _expiry_ctx():
    return {"validators": [], "genvm_datetime": "2024-08-01T00:00:00+00:00"}


@pytest.mark.integration
def test_p2p_contract_schema():
    contract = _deploy()
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


@pytest.mark.integration
def test_p2p_deposit_create_and_escrow(default_account, accounts):
    contract = _deploy()
    bob = accounts[1]

    dep = _deposit(contract, AMOUNT * 10)
    assert tx_execution_succeeded(dep)

    create = contract.create_bet(
        args=["2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT],
    ).transact()
    assert tx_execution_succeeded(create)

    alice = default_account.address
    assert contract.get_bet(args=[BET_ID]).call() == open_bet_state(alice)
    assert contract.get_total_escrow(args=[]).call() == AMOUNT
    assert contract.get_balance(args=[alice]).call() == AMOUNT * 9

    # Untrusted source rejected
    bad = contract.create_bet(
        args=["2024-06-20", "Spain", "Italy", "1", "https://example.com/x", AMOUNT],
    ).transact()
    assert not tx_execution_succeeded(bad)


@pytest.mark.integration
def test_p2p_full_resolution_flow_fees(default_account, accounts):
    """Deposit -> create -> join -> resolve (winner minus fee; owner fee accrues)."""
    bob = accounts[1]
    contract = _deploy()

    assert tx_execution_succeeded(_deposit(contract, AMOUNT * 10))
    assert tx_execution_succeeded(contract.connect(bob).deposit(args=[]).transact(
        value=AMOUNT * 10
    ))

    create = contract.create_bet(
        args=["2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT],
    ).transact()
    assert tx_execution_succeeded(create)

    bob_contract = contract.connect(bob)
    join = bob_contract.join_bet(args=[BET_ID, "2"]).transact()
    assert tx_execution_succeeded(join)

    alice = default_account.address
    assert contract.get_bet(args=[BET_ID]).call() == joined_bet_state(
        alice, bob.address
    )
    assert contract.get_total_escrow(args=[]).call() == AMOUNT * 2

    resolve = bob_contract.resolve_bet(args=[BET_ID]).transact(
        transaction_context=_resolve_context("1:0", 1),
        wait_interval=10000,
        wait_retries=30,
    )
    assert tx_execution_succeeded(resolve)

    bet = contract.get_bet(args=[BET_ID]).call()
    assert bet["status"] == "RESOLVED"
    assert bet["winner"] == alice  # Spain (team 1) won; Alice bet team 1
    assert contract.get_total_escrow(args=[]).call() == 0

    pot = AMOUNT * 2
    assert contract.get_owner_fees(args=[]).call() == pot * 200 // 10000


@pytest.mark.integration
def test_p2p_user_withdraw_and_owner_fee_withdraw(default_account, accounts):
    contract = _deploy()
    bob = accounts[1]

    assert tx_execution_succeeded(_deposit(contract, AMOUNT * 10))
    assert tx_execution_succeeded(contract.connect(bob).deposit(args=[]).transact(
        value=AMOUNT * 10
    ))

    # Create + join + resolve so a fee accrues
    assert tx_execution_succeeded(
        contract.create_bet(
            args=["2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT]
        ).transact()
    )
    bob_contract = contract.connect(bob)
    assert tx_execution_succeeded(
        bob_contract.join_bet(args=[BET_ID, "2"]).transact()
    )
    assert tx_execution_succeeded(
        bob_contract.resolve_bet(args=[BET_ID]).transact(
            transaction_context=_resolve_context("1:0", 1),
            wait_interval=10000,
            wait_retries=30,
        )
    )

    # User withdraws part of their balance
    wd = contract.withdraw(args=[AMOUNT]).transact()
    assert tx_execution_succeeded(wd)

    # Owner withdraws the accumulated fees
    wf = contract.withdraw_fees(args=[]).transact()
    assert tx_execution_succeeded(wf)
    assert contract.get_owner_fees(args=[]).call() == 0


@pytest.mark.integration
def test_p2p_expiry_refund(default_account, accounts):
    """After the settlement deadline, refund_expired returns both stakes."""
    bet_id = "2024-06-20_spain_italy"
    bob = accounts[1]
    contract = _deploy()

    assert tx_execution_succeeded(_deposit(contract, AMOUNT * 10))
    assert tx_execution_succeeded(contract.connect(bob).deposit(args=[]).transact(
        value=AMOUNT * 10
    ))
    assert tx_execution_succeeded(
        contract.create_bet(
            args=["2024-06-20", "Spain", "Italy", "1", RESOLUTION_URL, AMOUNT]
        ).transact()
    )
    bob_contract = contract.connect(bob)
    assert tx_execution_succeeded(bob_contract.join_bet(args=[bet_id, "2"]).transact())

    refund = contract.refund_expired(args=[bet_id]).transact(
        transaction_context=_expiry_ctx(),
        wait_interval=10000,
        wait_retries=30,
    )
    assert tx_execution_succeeded(refund)

    bet = contract.get_bet(args=[bet_id]).call()
    assert bet["status"] == "RESOLVED"
    assert bet["real_winner"] == "REFUND"
    assert contract.get_total_escrow(args=[]).call() == 0
    assert contract.get_owner_fees(args=[]).call() == 0  # no fee on refund
