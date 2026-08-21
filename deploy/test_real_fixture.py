"""Test create_bet with a REAL fixture from BBC for a near-future date."""
import os
import time

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))

ADDRESS = "0x346AEc8a5e659973D84A011ac6D53292Ace51Ede"
GEN = 10**18


def key(env_name):
    return os.environ.get(env_name, "")


def main():
    alice = create_account(key("STUDIO_PLAYER_A_PRIVATE_KEY"))
    bob = create_account(key("STUDIO_PLAYER_B_PRIVATE_KEY"))
    client = create_client(chain=studionet, account=alice)

    def read(name, args=None):
        return client.read_contract(address=ADDRESS, function_name=name, args=args, account=alice)

    def write(account, name, args=None, value=0):
        t0 = time.time()
        tx = client.write_contract(address=ADDRESS, function_name=name, args=args, account=account, value=value)
        receipt = client.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.FINALIZED, interval=3000, retries=120)
        status = receipt.get("status_name", receipt.get("status"))
        print(f"  {name} -> {status} in {time.time()-t0:.1f}s")
        return receipt

    print(f"Contract: {ADDRESS}")
    print(f"Owner: {read('get_owner')}\n")

    # Ensure alice has balance
    bal = read("get_balance", [alice.address])
    if bal < 3 * GEN:
        write(alice, "deposit", value=5 * GEN)

    # --- Test 1: PAST DATE (should revert) ---
    print("[1] create_bet with PAST date (2025-01-01) — should revert")
    try:
        write(alice, "create_bet", [
            "2025-01-01", "Arsenal", "Chelsea", "1",
            "https://www.bbc.com/sport/football/scores-fixtures/2025-01-01",
            1 * GEN, 0
        ])
        print("  ERROR: should have reverted!")
    except Exception as e:
        print(f"  OK reverted: {type(e).__name__}")

    # --- Test 2: FAKE TEAMS (should revert) ---
    print("\n[2] create_bet with FAKE teams — should revert")
    try:
        write(alice, "create_bet", [
            "2026-08-23", "FakeTeamX", "FakeTeamY", "1",
            "https://www.bbc.com/sport/football/scores-fixtures/2026-08-23",
            1 * GEN, 0
        ])
        print("  ERROR: should have reverted!")
    except Exception as e:
        print(f"  OK reverted: {type(e).__name__}")

    # --- Test 3: REAL TEAMS on BBC (2026-08-23 Sunday Premier League) ---
    print("\n[3] create_bet with REAL fixture — should succeed")
    bet_id = "2026-08-23_arsenal_chelsea"
    url = "https://www.bbc.com/sport/football/scores-fixtures/2026-08-23"
    try:
        write(alice, "create_bet", [
            "2026-08-23", "Arsenal", "Chelsea", "1", url, 1 * GEN, 0
        ])
        bet = read("get_bet", [bet_id])
        print(f"  Created: {bet['team1']} vs {bet['team2']} | {bet['status']}")
        print(f"  ID: {bet['id']}")
    except Exception as e:
        print(f"  Result: {type(e).__name__}: {e}")

    # --- Test 4: Join + Resolve with REAL fixture ---
    print("\n[4] join_bet — should succeed if bet was created")
    try:
        bet = read("get_bet", [bet_id])
        if bet["status"] == "OPEN":
            write(bob, "join_bet", [bet_id, "2"])
            bet = read("get_bet", [bet_id])
            print(f"  Joined: {bet['status']}")

            print("\n[5] resolve_bet (web fetch + LLM) — should succeed")
            write(bob, "resolve_bet", [bet_id])
            bet = read("get_bet", [bet_id])
            print(f"  Resolved: {bet['status']} | winner: {bet['real_winner']} | score: {bet['real_score']}")
        else:
            print(f"  Bet status is {bet['status']}, skipping join/resolve")
    except Exception as e:
        print(f"  Result: {type(e).__name__}: {e}")

    # --- Final state ---
    print("\n--- Final State ---")
    bets = read("get_bets")
    print(f"Total bets: {len(bets)}")
    for bid, b in bets.items():
        print(f"  {bid}: {b['team1']} vs {b['team2']} | {b['status']} | winner: {b['real_winner']}")
    print(f"Escrow: {read('get_total_escrow') / GEN} GEN")
    print(f"Fees: {read('get_owner_fees') / GEN} GEN")


if __name__ == "__main__":
    main()
