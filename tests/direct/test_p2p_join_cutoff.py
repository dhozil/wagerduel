"""Adversarial tests proving join_bet rejects started/completed/expired fixtures.

The contract enforces a match cutoff:
  1. If settlement window (game_date + 14 days) has passed → "use refund"
  2. If match kickoff has passed (datetime-level with kickoff_utc) → reject
  3. If match date has passed (date-only fallback without kickoff_utc) → reject

Direct mode uses vm.warp() to fast-forward gl.message_raw["datetime"].
We create bets with FUTURE game_dates (passes create_bet validation), then
warp time past the match kickoff to verify join_bet correctly rejects them.
"""

from tests.direct.conftest import (
    FIXTURES_MOCK_HTML,
    RESOLUTION_URL,
    fund,
    warp_datetime,
)

AMOUNT = 1000
GAME_DATE = "2050-06-20"
KICKOFF_UTC = "2050-06-20T18:00:00Z"  # 18:00 UTC on match day


def test_create_bet_false_future_kickoff_reverts(
    direct_vm, direct_deploy, direct_alice
):
    """A bet creator must not be able to push kickoff far into the future.

    Binding the kickoff to the match date is deterministic — a kickoff that is
    not on/near game_date is rejected at create time, so a false future
    kickoff can never be used to keep the duel joinable after the match.
    """
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice

    # Same match, but kickoff forged 50 years in the future.
    with direct_vm.expect_revert("Kickoff time must be on or near the match date"):
        contract.create_bet(
            GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT,
            kickoff_utc="2100-01-01T00:00:00Z",
        )


def test_create_bet_forged_kickoff_not_matching_fixture_reverts(
    direct_vm, direct_deploy, direct_alice
):
    """A same-day kickoff that does not match the fixture is rejected.

    Even when the kickoff is bound to the match date, the validator must
    cross-check it against the fetched fixture — a creator cannot invent a
    later kickoff on match day to permit betting on a known result.
    """
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)

    # Override autouse mocks: teams are valid, but the supplied kickoff does
    # not match the fixture page (valid_kickoff=false).
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*bbc\.com.*scores-fixtures.*", {
        "status": 200,
        "body": FIXTURES_MOCK_HTML,
    })
    direct_vm.mock_llm(
        r".*football fixture verifier.*",
        '{"valid": true, "valid_kickoff": false}',
    )
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Teams not found in fixtures for this date"):
        contract.create_bet(
            GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT,
            kickoff_utc="2050-06-20T21:00:00Z",
        )



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


def test_join_bet_same_day_before_kickoff_works(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Same-day join before kickoff time should succeed when kickoff_utc is set.

    The contract compares get_timestamp() against kickoff_utc, so a bet
    created with kickoff_utc="2050-06-20T18:00:00Z" can be joined at 14:00 UTC.
    """
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(
        GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT,
        kickoff_utc=KICKOFF_UTC,
    )

    # Warp to same day, 4 hours before kickoff.
    warp_datetime(direct_vm, "2050-06-20T14:00:00Z")
    direct_vm.sender = direct_bob
    contract.join_bet(f"{GAME_DATE}_teama_teamb", "2")

    bet = contract.get_bet(f"{GAME_DATE}_teama_teamb")
    assert bet["status"] == "JOINED"


def test_join_bet_same_day_after_kickoff_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Same-day join after kickoff time must revert.

    With kickoff_utc="2050-06-20T18:00:00Z", joining at 19:00 UTC (after kickoff)
    should be rejected even though it's the same calendar day.
    """
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(
        GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT,
        kickoff_utc=KICKOFF_UTC,
    )

    # Warp to same day, 1 hour after kickoff.
    warp_datetime(direct_vm, "2050-06-20T19:00:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot join bet: match has already started"):
        contract.join_bet(f"{GAME_DATE}_teama_teamb", "2")


def test_join_bet_same_day_exact_kickoff_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Joining at the exact kickoff time must revert (>= comparison)."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(
        GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT,
        kickoff_utc=KICKOFF_UTC,
    )

    # Warp to exact kickoff time.
    warp_datetime(direct_vm, "2050-06-20T18:00:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot join bet: match has already started"):
        contract.join_bet(f"{GAME_DATE}_teama_teamb", "2")


def test_join_bet_without_kickoff_utc_uses_date_fallback(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Without kickoff_utc, contract falls back to date-only comparison.

    Same-day join is blocked (date-only >= comparison).
    """
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT)

    # Warp to same day — no kickoff_utc, so date-only fallback blocks it.
    warp_datetime(direct_vm, f"{GAME_DATE}T14:00:00Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot join bet: match has already started or completed"):
        contract.join_bet(f"{GAME_DATE}_teama_teamb", "2")


def test_join_bet_next_day_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Joining a bet the day after the match date must revert."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    fund(direct_vm, contract, direct_bob, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT)

    # Warp to the day after the match date.
    warp_datetime(direct_vm, "2050-06-21T00:00:01Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot join bet: match has already started or completed"):
        contract.join_bet(f"{GAME_DATE}_teama_teamb", "2")


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


def test_get_bet_returns_kickoff_utc(direct_vm, direct_deploy, direct_alice):
    """get_bet should expose kickoff_utc field."""
    contract = direct_deploy("contracts/p2p_gambling.py")
    fund(direct_vm, contract, direct_alice, AMOUNT * 5)
    direct_vm.sender = direct_alice
    contract.create_bet(
        GAME_DATE, "TeamA", "TeamB", "1", RESOLUTION_URL, AMOUNT,
        kickoff_utc=KICKOFF_UTC,
    )

    bet = contract.get_bet(f"{GAME_DATE}_teama_teamb")
    assert bet["kickoff_utc"] == KICKOFF_UTC
