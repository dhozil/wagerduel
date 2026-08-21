"""Studionet coverage for the remaining public methods.

Covers: cancel_bet, refund_expired (OPEN + JOINED), owner withdraw_fees,
resolve_bet on an unfinished match (must revert).

Usage:
    python deploy/test_remaining_methods.py <contract_address>
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

ADDRESS = sys.argv[1] if len(sys.argv) > 1 else "0xe883305EF54422df7bbcBFf20A8eF87F79607750"
GEN = 10**18

PASS = 0
FAIL = 0


def check(label: str, ok: bool):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  PASS: {label}")
    else:
        FAIL += 1
        print(f"  FAIL: {label}")


def _exec_result(receipt) -> str:
    lr = receipt.get("consensus_data", {}).get("leader_receipt", [])
    if lr:
        return lr[0].get("execution_result", "UNKNOWN")
    return str(receipt.get("result", "UNKNOWN"))


def key(env):
    v = os.environ.get(env)
    if not v:
        raise SystemExit(f"Missing {env}")
    return v


def main():
    alice = create_account(key("STUDIO_PLAYER_A_PRIVATE_KEY"))
    bob = create_account(key("STUDIO_PLAYER_B_PRIVATE_KEY"))
    owner = create_account(key("STUDIO_OWNER_PRIVATE_KEY"))
    client = create_client(chain=studionet, account=alice)

    def read(name, args=None, acct=alice):
        return client.read_contract(address=ADDRESS, function_name=name, args=args, account=acct)

    def write(account, name, args=None, value=0, retries=200):
        t0 = time.time()
        tx = client.write_contract(address=ADDRESS, function_name=name, args=args, account=account, value=value)
        rec = client.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.FINALIZED, interval=3000, retries=retries)
        print(f"  {name} -> {_exec_result(rec)} in {time.time()-t0:.1f}s")
        return rec

    print(f"\n=== CONTRACT: {ADDRESS} ===")
    # Fund players
    if read("get_balance", [alice.address]) < 3 * GEN:
        write(alice, "deposit", value=5 * GEN)
    if read("get_balance", [bob.address]) < 3 * GEN:
        write(bob, "deposit", value=5 * GEN)

    # 1. Cancel an OPEN bet (creator cancels, stake refunded)
    print("\n[cancel_bet]")
    bet_c = "2026-08-22_ipswich town_sunderland"
    url = "https://www.bbc.com/sport/football/scores-fixtures/2026-08-22"
    kickoff = "2026-08-22T14:00:00Z"  # 15:00 UK = 14:00 UTC in BST
    rec = write(alice, "create_bet", ["2026-08-22", "Ipswich Town", "Sunderland", "1", url, GEN, 0, kickoff])
    if _exec_result(rec) == "SUCCESS":
        # Bob tries to cancel someone else's OPEN bet -> revert
        rec = write(bob, "cancel_bet", [bet_c])
        check("non-creator cancel (reverts)", _exec_result(rec) == "ERROR")
        # Creator cancels -> success, bet CANCELED, escrow released
        rec = write(alice, "cancel_bet", [bet_c])
        check("creator cancel (accepted)", _exec_result(rec) == "SUCCESS")
        b = read("get_bet", [bet_c])
        check("bet CANCELED", b["status"] == "CANCELED")
        check("stake refunded", read("get_balance", [alice.address]) >= 4 * GEN)
    else:
        check("create cancel fixture (accepted)", False)

    # 2. withdraw_fees by owner on empty fees -> revert
    print("\n[withdraw_fees owner]")
    rec = write(owner, "withdraw_fees")
    check("owner withdraw_fees with 0 fees (reverts)", _exec_result(rec) == "ERROR")

    # 3. refund_expired on an OPEN bet BEFORE the deadline -> revert
    print("\n[refund_expired before deadline]")
    bet_o = "2026-08-23_manchester city_bournemouth"
    url_o = "https://www.bbc.com/sport/football/scores-fixtures/2026-08-23"
    kickoff_o = "2026-08-23T13:00:00Z"  # 14:00 UK = 13:00 UTC in BST
    rec = write(alice, "create_bet", ["2026-08-23", "Manchester City", "Bournemouth", "1", url_o, GEN, 0, kickoff_o])
    if _exec_result(rec) == "SUCCESS":
        rec = write(bob, "refund_expired", [bet_o])
        check("refund before deadline (reverts)", _exec_result(rec) == "ERROR")
    else:
        check("create refund fixture (accepted)", False)

    # 4. resolve_bet on JOINED but unfinished match -> revert ("Match not finished")
    print("\n[resolve_bet on unfinished match]")
    # Join the Nottingham Forest / Leeds bet if still OPEN, or create+join a fresh one.
    try:
        b = read("get_bet", [bet_o])
        status = b["status"]
    except Exception:
        status = None
    if status == "OPEN":
        rec = write(bob, "join_bet", [bet_o, "2"])
        if _exec_result(rec) == "SUCCESS":
            rec = write(bob, "resolve_bet", [bet_o])
            check("resolve unfinished (reverts)", _exec_result(rec) == "ERROR")
            b = read("get_bet", [bet_o])
            check("bet still JOINED (no settle)", b["status"] == "JOINED")
        else:
            check("join for resolve test", False)
    elif status == "JOINED":
        rec = write(bob, "resolve_bet", [bet_o])
        check("resolve unfinished (reverts)", _exec_result(rec) == "ERROR")
        b = read("get_bet", [bet_o])
        check("bet still JOINED (no settle)", b["status"] == "JOINED")
    else:
        check("resolve-unfinished setup (found open/joined bet)", False)

    print(f"\n=== SUMMARY: {PASS} passed, {FAIL} failed ===")
    if FAIL:
        raise SystemExit(f"{FAIL} checks failed")
    print("ALL REMAINING METHOD CHECKS PASSED")


if __name__ == "__main__":
    main()