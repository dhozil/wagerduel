"""Test resolve on a finished match + owner restriction fix."""
import os
import time

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))

ADDRESS = "0x4fbD8d7f0ff5253dDDD10a0aa280780431F84b9e"
GEN = 10**18


def key(env_name):
    return os.environ.get(env_name, "")


def main():
    alice = create_account(key("STUDIO_PLAYER_A_PRIVATE_KEY"))
    bob = create_account(key("STUDIO_PLAYER_B_PRIVATE_KEY"))
    owner = create_account(key("STUDIO_OWNER_PRIVATE_KEY"))
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

    # Show current bets
    print("=== CURRENT STATE ===")
    bets = read("get_bets")
    print(f"Existing bets: {len(bets)}")
    for bid, b in bets.items():
        print(f"  {bid}: {b['team1']} vs {b['team2']} | {b['status']}")

    # 1. Owner restriction with DIFFERENT teams
    print("\n[1] OWNER restriction (different teams) — should revert")
    try:
        write(owner, "create_bet", [
            "2026-08-23", "Newcastle United", "Liverpool", "1",
            "https://www.bbc.com/sport/football/scores-fixtures/2026-08-23",
            1 * GEN, 0
        ])
        bet = read("get_bet", ["2026-08-23_newcastle united_liverpool"])
        print(f"  FAIL: owner created bet! {bet['status']}")
    except Exception as e:
        print(f"  PASS: reverted ({type(e).__name__})")

    # 2. Resolve the existing bet (match is future — should say "not finished")
    print("\n[2] RESOLVE existing bet (match is future) — should revert")
    bet_id = "2026-08-23_manchester city_bournemouth"
    try:
        bet = read("get_bet", [bet_id])
        print(f"  Bet status: {bet['status']}")
        if bet["status"] == "JOINED":
            write(bob, "resolve_bet", [bet_id])
            bet = read("get_bet", [bet_id])
            print(f"  Result: {bet['status']} | winner: {bet['real_winner']} | score: {bet['real_score']}")
        else:
            print(f"  SKIP: not JOINED")
    except Exception as e:
        print(f"  PASS: reverted ({type(e).__name__})")

    # 3. Refund the existing bet (match is future — should say "deadline not reached")
    print("\n[3] REFUND existing bet — should revert (deadline not reached)")
    try:
        write(alice, "refund_expired", [bet_id])
        print(f"  FAIL: refund succeeded!")
    except Exception as e:
        print(f"  PASS: reverted ({type(e).__name__})")

    # Final state
    print("\n=== FINAL STATE ===")
    bets = read("get_bets")
    print(f"Total bets: {len(bets)}")
    for bid, b in bets.items():
        print(f"  {bid}: {b['team1']} vs {b['team2']} | {b['status']}")
    print(f"Escrow: {read('get_total_escrow') / GEN} GEN")


if __name__ == "__main__":
    main()
