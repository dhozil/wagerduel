"""Adversarial tests proving join_bet rejects started/completed/expired fixtures.

The contract enforces a match cutoff:
  1. If settlement window (game_date + 14 days) has passed → "use refund"
  2. If match date has passed (started/completed) → reject

Direct mode uses vm.warp() to fast-forward gl.message_raw["datetime"].
We create bets with FUTURE game_dates (passes create_bet validation), then
warp time past the match date to verify join_bet correctly rejects them.
"""

from tests.direct.conftest import RESOLUTION_URL, fund, warp_datetime

AMOUNT = 1000
GAME_DATE = "2050-06-20"


def test_join_bet_before_match_still_works(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Joining a bet whose match date is in the future should succeed."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_bob
    contract.join_bet(f"{GAME_DATE}_teama_teamb", "2")

    bet = contract.get_bet(f"{GAME_DATE}_teama_teamb")
    assert bet["status"] == "JOINED"
    assert bet["opponent_side"] == "2"
    assert contract.get_total_escrow() == AMOUNT * 2


def test_join_bet_after_match_start_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Joining a bet whose match date has passed must revert.

    We warp time to the day after the game_date, within the 14-day settlement
    window. The "match already started" error fires instead of the
    "settlement window" one.
    """
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT)

    # Warp past the match date but within the 14-day settlement window.
    warp_datetime(direct_vm, "2050-06-21T12:00:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot join bet: match has already started or completed"):
        contract.join_bet(f"{GAME_DATE}_teama_teamb", "2")


def test_join_bet_after_settlement_window_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """Joining after the 14-day settlement window must give the refund hint."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    fund(direct_vm, contract, direct_charlie, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT)

    # Warp past the 14-day settlement window (2050-06-20 + 14d = 2050-07-04).
    warp_datetime(direct_vm, "2050-07-05T12:00:00Z")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Cannot join bet: settlement window has passed; use refund"):
        contract.join_bet(f"{GAME_DATE}_teama_teamb", "1")


def test_join_bet_draw_side_with_past_date_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Draw-side bets with a past game_date are also rejected."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Denmark", "England", "0", RESOLUTION_URL, AMOUNT)

    # Warp past the settlement window.
    warp_datetime(direct_vm, "2050-07-05T12:00:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot join bet: settlement window has passed; use refund"):
        contract.join_bet(f"{GAME_DATE}_denmark_england", "1")


def test_join_bet_draw_side_future_date_works(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Draw-side bets with a future game_date still work."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "Denmark", "England", "0", RESOLUTION_URL, AMOUNT)

    direct_vm.sender = direct_bob
    contract.join_bet(f"{GAME_DATE}_denmark_england", "1")

    bet = contract.get_bet(f"{GAME_DATE}_denmark_england")
    assert bet["status"] == "JOINED"
    assert bet["opponent_side"] == "1"
