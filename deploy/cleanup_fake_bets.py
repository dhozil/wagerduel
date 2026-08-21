"""Cancel all bets with fake/test team names on studionet.

Lists all bets, identifies fake ones (e.g. FarPastX, Aliceteam, Bobteam,
Barcelona vs Leeds, etc.) and calls cancel_bet for OPEN ones or
refund_expired for JOINED/OPEN ones past deadline.
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

# Known fake/test teams to clean up
FAKE_TEAMS = {
    "farpastx", "farpasty", "aliceteam", "bobteam", "barcelona", "leeds",
    "spain", "italy", "test1", "test2", "fake", "mock",
}


def key(env_name: str):
    value = os.environ.get(env_name)
    if not value:
        raise SystemExit(f"Missing {env_name} in .env")
    return value


def main():
    owner = create_account(key("STUDIO_OWNER_PRIVATE_KEY"))
    alice = create_account(key("STUDIO_PLAYER_A_PRIVATE_KEY"))
    bob = create_account(key("STUDIO_PLAYER_B_PRIVATE_KEY"))
    client = create_client(chain=studionet, account=owner)

    def read(name, args=None):
        return client.read_contract(
            address=ADDRESS, function_name=name, args=args, account=owner
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

    bet_ids = read("get_bets")
    print(f"Total bets on contract: {len(bet_ids)}")

    canceled = 0
    refunded = 0
    skipped = 0

    for bid in bet_ids:
        bet = read("get_bet", [bid])
        t1 = bet["team1"].lower()
        t2 = bet["team2"].lower()
        status = bet["status"]
        is_fake = t1 in FAKE_TEAMS or t2 in FAKE_TEAMS

        if not is_fake:
            skipped += 1
            continue

        print(f"\n[FAKE] {bid} | {bet['team1']} vs {bet['team2']} | {status}")

        if status == "OPEN":
            creator = bet["creator"].lower()
            if creator == owner.address.lower():
                try:
                    write(owner, "cancel_bet", [bid])
                    canceled += 1
                except Exception as e:
                    print(f"  cancel failed: {e}")
                    try:
                        write(owner, "refund_expired", [bid])
                        refunded += 1
                    except Exception as e2:
                        print(f"  refund also failed: {e2}")
            else:
                try:
                    write(owner, "refund_expired", [bid])
                    refunded += 1
                except Exception as e:
                    print(f"  refund failed: {e}")
        elif status == "JOINED":
            try:
                write(owner, "refund_expired", [bid])
                refunded += 1
            except Exception as e:
                print(f"  refund failed: {e}")
        else:
            print(f"  skipping (already {status})")

    print(f"\nDone: canceled={canceled}, refunded={refunded}, skipped={skipped}")


if __name__ == "__main__":
    main()
