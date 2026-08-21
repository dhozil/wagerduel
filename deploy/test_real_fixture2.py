"""Test with exact team names from BBC fixtures for 2026-08-23."""
import os
import time

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))

ADDRESS = "0xe883305EF54422df7bbcBFf20A8eF87F79607750"
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
    print(f"Alice: {alice.address}")
    print(f"Bob:   {bob.address}")
    print(f"Owner: {read('get_owner')}\n")

    # Ensure balance
    ab = read("get_balance", [alice.address])
    if ab < 2 * GEN:
        print("[0] Depositing for Alice...")
        write(alice, "deposit", value=5 * GEN)
    bb = read("get_balance", [bob.address])
    if bb < 2 * GEN:
        write(bob, "deposit", value=5 * GEN)

    # Test 1: PAST DATE (should revert)
    print("\n[1] PAST DATE (2025-01-01) — should revert")
    try:
        write(alice, "create_bet", [
            "2025-01-01", "Arsenal", "Chelsea", "1",
            "https://www.bbc.com/sport/football/scores-fixtures/2025-01-01",
            1 * GEN, 0
        ])
        bet = read("get_bet", ["2025-01-01_arsenal_chelsea"])
        print(f"  FAIL: bet created! {bet['status']}")
    except Exception as e:
        print(f"  PASS: reverted ({type(e).__name__})")

    # Test 2: FAKE TEAMS (should revert)
    print("\n[2] FAKE TEAMS — should revert")
    try:
        write(alice, "create_bet", [
            "2026-08-23", "FakeTeamX", "FakeTeamY", "1",
            "https://www.bbc.com/sport/football/scores-fixtures/2026-08-23",
            1 * GEN, 0
        ])
        bet = read("get_bet", ["2026-08-23_faketeamx_faketeamy"])
        print(f"  FAIL: bet created! {bet['status']}")
    except Exception as e:
        print(f"  PASS: reverted ({type(e).__name__})")

    # Test 3: REAL fixture — Man City vs Bournemouth (from BBC)
    print("\n[3] REAL fixture: Manchester City vs Bournemouth — should succeed")
    bet_id = "2026-08-23_manchester city_bournemouth"
    url = "https://www.bbc.com/sport/football/scores-fixtures/2026-08-23"
    try:
        write(alice, "create_bet", [
            "2026-08-23", "Manchester City", "Bournemouth", "1", url, 1 * GEN, 0
        ])
        bet = read("get_bet", [bet_id])
        print(f"  PASS: created {bet['team1']} vs {bet['team2']} | {bet['status']}")
    except Exception as e:
        print(f"  FAIL: {type(e).__name__}: {e}")

    # Test 4: Join bet
    print("\n[4] JOIN bet — Bob joins on Bournemouth (side 2)")
    try:
        bet = read("get_bet", [bet_id])
        if bet["status"] == "OPEN":
            write(bob, "join_bet", [bet_id, "2"])
            bet = read("get_bet", [bet_id])
            print(f"  PASS: {bet['status']} | opponent: {bet['opponent'][:10]}...")
        else:
            print(f"  SKIP: bet status is {bet['status']}")
    except Exception as e:
        print(f"  FAIL: {type(e).__name__}: {e}")

    # Test 5: Resolve bet (web fetch + LLM)
    print("\n[5] RESOLVE bet (web fetch + LLM)")
    try:
        bet = read("get_bet", [bet_id])
        if bet["status"] == "JOINED":
            write(bob, "resolve_bet", [bet_id])
            bet = read("get_bet", [bet_id])
            print(f"  PASS: {bet['status']} | winner: {bet['real_winner']} | score: {bet['real_score']}")
        else:
            print(f"  SKIP: bet status is {bet['status']}")
    except Exception as e:
        print(f"  FAIL: {type(e).__name__}: {e}")

    # Test 6: Owner restriction
    print("\n[6] OWNER restriction — should revert")
    owner_acct = create_account(key("STUDIO_OWNER_PRIVATE_KEY"))
    client_o = create_client(chain=studionet, account=owner_acct)
    try:
        tx = client_o.write_contract(
            address=ADDRESS, function_name="create_bet",
            args=["2026-08-23", "Manchester City", "Bournemouth", "2", url, 1 * GEN, 0],
            account=owner_acct,
        )
        receipt = client_o.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.FINALIZED, interval=3000, retries=120)
        # Check if bet was created
        try:
            bet = client_o.read_contract(address=ADDRESS, function_name="get_bet", args=["2026-08-23_manchester city_bournemouth"], account=owner_acct)
            print(f"  FAIL: owner created bet! {bet['status']}")
        except:
            print(f"  PASS: owner blocked (FINALIZED but no state change)")
    except Exception as e:
        print(f"  PASS: reverted ({type(e).__name__})")

    # Test 7: Duplicate bet (should revert)
    print("\n[7] DUPLICATE bet — should revert")
    try:
        write(alice, "create_bet", [
            "2026-08-23", "Manchester City", "Bournemouth", "2", url, 1 * GEN, 0
        ])
        print(f"  FAIL: duplicate created!")
    except Exception as e:
        print(f"  PASS: reverted ({type(e).__name__})")

    # Final state
    print("\n=== FINAL STATE ===")
    bets = read("get_bets")
    print(f"Total bets: {len(bets)}")
    for bid, b in bets.items():
        print(f"  {bid}: {b['team1']} vs {b['team2']} | {b['status']} | winner: {b['real_winner']} | score: {b['real_score']}")
    print(f"Escrow: {read('get_total_escrow') / GEN} GEN")
    print(f"Fees: {read('get_owner_fees') / GEN} GEN")


if __name__ == "__main__":
    main()
