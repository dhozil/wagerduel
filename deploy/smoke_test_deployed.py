"""Live smoke test against the already-deployed studionet contract.

Uses ONLY the 2 player accounts (no contract deploy) and calls every method
without sim_config, so nothing hangs on hosted validators. For the deadline
test the game_date is well in the past so refund_expired is unlockable.

Modes:
    python deploy/smoke_test_deployed.py [address]            # deterministic methods
    python deploy/smoke_test_deployed.py [address] --resolve  # + real AI resolve
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

ADDRESS = "0x60c887B1D0A9f7D703193158d57B2C5F1baf2ae8"
OWNER = "0x28Cf6872815C1F275b4Ae5a291799d11cF5bd0De"
GEN = 10**18
RESOLVE = "--resolve" in sys.argv
if "--resolve" in sys.argv:
    sys.argv.remove("--resolve")
if len(sys.argv) > 1:
    ADDRESS = sys.argv[1]


def key(env_name: str):
    value = os.environ.get(env_name)
    if not value:
        raise SystemExit(f"Missing {env_name} in .env")
    return value


def elapsed(label: str, start: float):
    print(f"  ~ {label}: {time.time() - start:.1f}s")


def _bet_status(client, address, read, bet_id):
    try:
        return read("get_bet", [bet_id])["status"]
    except Exception:
        return None


def main() -> None:
    alice = create_account(key("STUDIO_PLAYER_A_PRIVATE_KEY"))
    bob = create_account(key("STUDIO_PLAYER_B_PRIVATE_KEY"))
    client = create_client(chain=studionet, account=alice)

    def read(name: str, args: list | None = None):
        return client.read_contract(
            address=ADDRESS, function_name=name, args=args, account=alice
        )

    def write(account, name: str, args: list | None = None, value: int = 0):
        t0 = time.time()
        tx = client.write_contract(
            address=ADDRESS,
            function_name=name,
            args=args,
            account=account,
            value=value,
        )
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx,
            status=TransactionStatus.FINALIZED,
            interval=3000,
            retries=120,
        )
        status = receipt.get("status_name", receipt.get("status"))
        print(
            f"  {name} -> {status} in {time.time() - t0:.1f}s "
            f"(from {account.address[:10]})"
        )
        return receipt

    print(f"Contract: {ADDRESS}")
    t0 = time.time()
    print("Owner:", read("get_owner"))
    print("Escrow:", read("get_total_escrow"))
    print("Bets count:", len(read("get_bets")))
    elapsed("views", t0)

    # 1. deposit both players
    write(alice, "deposit", value=2 * GEN)
    write(bob, "deposit", value=2 * GEN)
    print("Balances:", alice.address[:10], read("get_balance", [alice.address]),
          "|", bob.address[:10], read("get_balance", [bob.address]))

    # 2. create a bet well past its settlement deadline (no resolve -> refund)
    bet_id = "2025-01-01_aliceteam_bobteam"
    already = _bet_status(client, ADDRESS, read, bet_id)
    if already not in ("RESOLVED",):
        write(alice, "create_bet",
              ["2025-01-01", "Aliceteam", "Bobteam", "1",
               "https://www.bbc.com/sport/football/scores-fixtures/2025-01-01",
               1 * GEN, 0])

    # 3. join with the opposite side
    if _bet_status(client, ADDRESS, read, bet_id) == "OPEN":
        write(bob, "join_bet", [bet_id, "2"])

    # 4. refund_expired with NO sim_config (deadline already passed in real time)
    if _bet_status(client, ADDRESS, read, bet_id) == "JOINED":
        write(bob, "refund_expired", [bet_id])

    bet = read("get_bet", [bet_id])
    print("Bet status:", bet["status"], "| real_winner:", bet["real_winner"],
          "| handicap_halves:", bet["handicap_halves"])
    print("Escrow after refund:", read("get_total_escrow"))
    print("Balances after refund:", alice.address[:10], read("get_balance", [alice.address]),
          "|", bob.address[:10], read("get_balance", [bob.address]))

    # 5. OPEN bet nobody joined: after the deadline, anyone can trigger the
    #    expiry refund -> the creator gets their stake back, bet CANCELED.
    hb_id = "2025-01-03_barcelona_leeds"
    if _bet_status(client, ADDRESS, read, hb_id) not in ("RESOLVED", "CANCELED"):
        write(alice, "create_bet",
              ["2025-01-03", "Barcelona", "Leeds", "1",
               "https://www.bbc.com/sport/football/scores-fixtures/2025-01-03",
               1 * GEN, 0])
    if _bet_status(client, ADDRESS, read, hb_id) == "OPEN":
        write(bob, "refund_expired", [hb_id])  # no join -> OPEN refund path
    hb = read("get_bet", [hb_id])
    print("OPEN refund bet:", hb["team1"], "vs", hb["team2"],
          "| status:", hb["status"], "| real_winner:", hb["real_winner"])
    assert hb["status"] == "CANCELED" and hb["real_winner"] == "REFUND", \
        "OPEN refund did not settle"
    print("Escrow after OPEN refund:", read("get_total_escrow"))
    print("Balance of", alice.address[:10], "after OPEN refund:",
          read("get_balance", [alice.address]))

    # 6. Owner-only gate: a player cannot withdraw fees (tx reverts)
    rec = write(bob, "withdraw_fees")
    status = rec.get("status_name", rec.get("status"))
    print("withdraw_fees (player) status:", status,
          "(expect revert / not FINALIZED)")

    if RESOLVE:
        _real_resolve(client, write, read, alice, bob)

    print("SMOKE OK")


def _real_resolve(client, write, read, alice, bob):
    """Real end-to-end resolve: web fetch + LLM + validator consensus.

    Uses a real finished match (Spain 1-0 Italy, UEFA Euro 2024-06-20) whose
    scoreboard lives on the trusted BBC URL committed to the contract.
    """
    bet_id = "2024-06-20_spain_italy"
    url = "https://www.bbc.com/sport/football/scores-fixtures/2024-06-20"

    if read("get_balance", [alice.address]) < 2 * GEN:
        write(alice, "deposit", value=2 * GEN)
    if read("get_balance", [bob.address]) < 2 * GEN:
        write(bob, "deposit", value=2 * GEN)

    try:
        state = read("get_bet", [bet_id])
        exists = state["status"]
    except Exception:
        exists = None
    if not exists:
        write(alice, "create_bet",
              ["2024-06-20", "Spain", "Italy", "1", url, 1 * GEN, 0])
        state = read("get_bet", [bet_id])
        exists = state["status"]
    if exists == "OPEN":
        write(bob, "join_bet", [bet_id, "2"])

    print("  resolving... this runs REAL web + AI validators (may take minutes)")
    t0 = time.time()
    write(bob, "resolve_bet", [bet_id])
    print(f"  resolve tx finalized in {time.time() - t0:.1f}s")

    bet = read("get_bet", [bet_id])
    print("Resolved:", bet["status"], "| winner:", bet["winner"][:10],
          "| side:", bet["real_winner"], "| score:", bet["real_score"])
    print("Owner fees:", read("get_owner_fees"))
    assert bet["status"] == "RESOLVED", "resolve did not settle"
    assert bet["real_winner"] in ("1", "2", "0"), "no valid winner recorded"


if __name__ == "__main__":
    main()