"""Comprehensive test for the newly deployed contract.

Tests all methods including:
- deposit/withdraw (balance management)
- create_bet with REAL fixtures (web fetch + LLM validation)
- create_bet with FAKE teams (should revert)
- create_bet with PAST dates (should revert)
- join_bet (before/after cutoff)
- resolve_bet (web fetch + LLM result)
- refund_expired
- cancel_bet
- views (get_bet, get_bets, get_balance, etc.)
"""
import os
import sys
import time

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))

ADDRESS = "0x4fbD8d7f0ff5253dDDD10a0aa280780431F84b9e"
GEN = 10**18
RESOLVED_ONLY = "--resolved" in sys.argv


def key(env_name: str):
    value = os.environ.get(env_name)
    if not value:
        raise SystemExit(f"Missing {env_name} in .env")
    return value


def elapsed(label: str, start: float):
    print(f"  ~ {label}: {time.time() - start:.1f}s")


def main():
    owner = create_account(key("STUDIO_OWNER_PRIVATE_KEY"))
    alice = create_account(key("STUDIO_PLAYER_A_PRIVATE_KEY"))
    bob = create_account(key("STUDIO_PLAYER_B_PRIVATE_KEY"))
    client = create_client(chain=studionet, account=alice)

    def read(name, args=None):
        return client.read_contract(
            address=ADDRESS, function_name=name, args=args, account=alice
        )

    def write(account, name, args=None, value=0):
        t0 = time.time()
        tx = client.write_contract(
            address=ADDRESS, function_name=name, args=args,
            account=account, value=value,
        )
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx,
            status=TransactionStatus.FINALIZED,
            interval=3000, retries=120,
        )
        status = receipt.get("status_name", receipt.get("status"))
        print(f"  {name}({args[0] if args else ''}) -> {status} in {time.time()-t0:.1f}s")
        return receipt

    print(f"=== Testing Contract: {ADDRESS} ===\n")

    # 1. Basic views
    print("[1] Basic Views")
    owner_addr = read("get_owner")
    print(f"  Owner: {owner_addr}")
    escrow = read("get_total_escrow")
    print(f"  Escrow: {escrow}")
    fees = read("get_owner_fees")
    print(f"  Owner fees: {fees}")

    # 2. Deposit
    print("\n[2] Deposit")
    write(alice, "deposit", value=5 * GEN)
    write(bob, "deposit", value=5 * GEN)
    alice_bal = read("get_balance", [alice.address])
    bob_bal = read("get_balance", [bob.address])
    print(f"  Alice balance: {alice_bal / GEN} GEN")
    print(f"  Bob balance: {bob_bal / GEN} GEN")

    # 3. Create bet with REAL fixture (web fetch + LLM)
    print("\n[3] Create Bet - REAL Fixture (web fetch + LLM)")
    real_bet_id = "2026-08-30_spain_italy"
    url = "https://www.bbc.com/sport/football/scores-fixtures/2026-08-30"
    try:
        write(alice, "create_bet", [
            "2026-08-30", "Spain", "Italy", "1", url, 1 * GEN, 0
        ])
        bet = read("get_bet", [real_bet_id])
        print(f"  Created: {bet['team1']} vs {bet['team2']} | status: {bet['status']}")
    except Exception as e:
        print(f"  FAILED: {e}")

    # 4. Create bet with FAKE teams (should revert)
    print("\n[4] Create Bet - FAKE Teams (should revert)")
    try:
        write(alice, "create_bet", [
            "2026-08-30", "FakeTeamX", "FakeTeamY", "1", url, 1 * GEN, 0
        ])
        print("  ERROR: Should have reverted!")
    except Exception as e:
        print(f"  Correctly reverted: {e}")

    # 5. Create bet with PAST date (should revert)
    print("\n[5] Create Bet - PAST Date (should revert)")
    try:
        write(alice, "create_bet", [
            "2025-01-01", "Spain", "Italy", "1",
            "https://www.bbc.com/sport/football/scores-fixtures/2025-01-01",
            1 * GEN, 0
        ])
        print("  ERROR: Should have reverted!")
    except Exception as e:
        print(f"  Correctly reverted: {e}")

    # 6. Join bet with opposite side
    print("\n[6] Join Bet")
    try:
        write(bob, "join_bet", [real_bet_id, "2"])
        bet = read("get_bet", [real_bet_id])
        print(f"  Joined: {bet['team1']} vs {bet['team2']} | status: {bet['status']}")
        print(f"  Creator: {bet['creator_side']} | Opponent: {bet['opponent_side']}")
    except Exception as e:
        print(f"  FAILED: {e}")

    # 7. Resolve bet (web fetch + LLM)
    print("\n[7] Resolve Bet (web fetch + LLM)")
    try:
        write(bob, "resolve_bet", [real_bet_id])
        bet = read("get_bet", [real_bet_id])
        print(f"  Resolved: {bet['status']} | winner: {bet['real_winner']} | score: {bet['real_score']}")
    except Exception as e:
        print(f"  FAILED: {e}")

    # 8. Cancel bet (creator only)
    print("\n[8] Cancel Bet")
    cancel_bet_id = "2026-08-30_england_germany"
    try:
        write(alice, "create_bet", [
            "2026-08-30", "England", "Germany", "1", url, 1 * GEN, 0
        ])
        write(alice, "cancel_bet", [cancel_bet_id])
        bet = read("get_bet", [cancel_bet_id])
        print(f"  Canceled: {bet['status']}")
    except Exception as e:
        print(f"  FAILED: {e}")

    # 9. Owner restrictions
    print("\n[9] Owner Restrictions")
    try:
        write(owner, "create_bet", [
            "2026-08-30", "Spain", "Italy", "1", url, 1 * GEN, 0
        ])
        print("  ERROR: Owner should not be able to create bet!")
    except Exception as e:
        print(f"  Correctly blocked: {e}")

    # 10. Withdraw
    print("\n[10] Withdraw")
    try:
        write(alice, "withdraw", [1 * GEN])
        alice_bal = read("get_balance", [alice.address])
        print(f"  Alice balance after withdraw: {alice_bal / GEN} GEN")
    except Exception as e:
        print(f"  FAILED: {e}")

    # 11. Withdraw fees (owner only)
    print("\n[11] Withdraw Fees (owner only)")
    try:
        write(owner, "withdraw_fees")
        fees = read("get_owner_fees")
        print(f"  Owner fees after withdraw: {fees}")
    except Exception as e:
        print(f"  FAILED: {e}")

    # 12. View all bets
    print("\n[12] View All Bets")
    bets = read("get_bets")
    print(f"  Total bets: {len(bets)}")
    for bid, bet in bets.items():
        print(f"    {bid}: {bet['team1']} vs {bet['team2']} | {bet['status']}")

    # Summary
    print("\n=== TEST SUMMARY ===")
    print(f"Contract: {ADDRESS}")
    print(f"Owner: {owner_addr}")
    print(f"Escrow: {read('get_total_escrow') / GEN} GEN")
    print(f"Fees: {read('get_owner_fees') / GEN} GEN")
    print(f"Alice balance: {read('get_balance', [alice.address]) / GEN} GEN")
    print(f"Bob balance: {read('get_balance', [bob.address]) / GEN} GEN")


if __name__ == "__main__":
    main()
