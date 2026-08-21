"""Step-by-step debug test for new contract."""
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


def key(env_name: str):
    value = os.environ.get(env_name)
    if not value:
        raise SystemExit(f"Missing {env_name} in .env")
    return value


def main():
    alice = create_account(key("STUDIO_PLAYER_A_PRIVATE_KEY"))
    bob = create_account(key("STUDIO_PLAYER_B_PRIVATE_KEY"))
    client = create_client(chain=studionet, account=alice)

    print(f"Alice: {alice.address}")
    print(f"Bob:   {bob.address}")
    print(f"Contract: {ADDRESS}\n")

    # Check owner
    try:
        owner = client.read_contract(
            address=ADDRESS, function_name="get_owner", account=alice
        )
        print(f"Owner: {owner}")
        print(f"Owner matches alice? {owner.lower() == alice.address.lower()}")
        print(f"Owner matches bob? {owner.lower() == bob.address.lower()}")
    except Exception as e:
        print(f"get_owner failed: {e}")

    # Check balances
    try:
        ab = client.read_contract(
            address=ADDRESS, function_name="get_balance", args=[alice.address], account=alice
        )
        bb = client.read_contract(
            address=ADDRESS, function_name="get_balance", args=[bob.address], account=alice
        )
        print(f"\nAlice balance: {ab / GEN} GEN")
        print(f"Bob balance: {bb / GEN} GEN")
    except Exception as e:
        print(f"get_balance failed: {e}")

    # Check all bets
    try:
        bets = client.read_contract(
            address=ADDRESS, function_name="get_bets", account=alice
        )
        print(f"\nTotal bets: {len(bets)}")
        for bid, bet in bets.items():
            print(f"  {bid}: {bet['team1']} vs {bet['team2']} | {bet['status']}")
    except Exception as e:
        print(f"get_bets failed: {e}")

    # Deposit for alice
    print("\n--- Deposit for Alice ---")
    try:
        tx = client.write_contract(
            address=ADDRESS, function_name="deposit",
            account=alice, value=5 * GEN,
        )
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx,
            status=TransactionStatus.FINALIZED,
            interval=3000, retries=120,
        )
        print(f"deposit -> {receipt.get('status_name', receipt.get('status'))}")
        ab = client.read_contract(
            address=ADDRESS, function_name="get_balance", args=[alice.address], account=alice
        )
        print(f"Alice balance: {ab / GEN} GEN")
    except Exception as e:
        print(f"deposit failed: {e}")

    # Try create_bet with a future date and REAL fixture
    print("\n--- Create Bet: Real Fixture (2026-08-30 Spain vs Italy) ---")
    bet_id = "2026-08-30_spain_italy"
    try:
        tx = client.write_contract(
            address=ADDRESS, function_name="create_bet",
            args=["2026-08-30", "Spain", "Italy", "1",
                  "https://www.bbc.com/sport/football/scores-fixtures/2026-08-30",
                  1 * GEN, 0],
            account=alice,
        )
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx,
            status=TransactionStatus.FINALIZED,
            interval=3000, retries=120,
        )
        print(f"create_bet -> {receipt.get('status_name', receipt.get('status'))}")

        # Try to read it back
        try:
            bet = client.read_contract(
                address=ADDRESS, function_name="get_bet", args=[bet_id], account=alice
            )
            print(f"get_bet: {bet['team1']} vs {bet['team2']} | {bet['status']}")
        except Exception as e:
            print(f"get_bet failed: {e}")
    except Exception as e:
        print(f"create_bet failed: {e}")

    # Try create_bet with FAKE teams
    print("\n--- Create Bet: FAKE Teams (should revert) ---")
    try:
        tx = client.write_contract(
            address=ADDRESS, function_name="create_bet",
            args=["2026-08-30", "FakeTeamX", "FakeTeamY", "1",
                  "https://www.bbc.com/sport/football/scores-fixtures/2026-08-30",
                  1 * GEN, 0],
            account=alice,
        )
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx,
            status=TransactionStatus.FINALIZED,
            interval=3000, retries=120,
        )
        status = receipt.get("status_name", receipt.get("status"))
        print(f"create_bet(fake) -> {status}")
        # Check if bet was created
        try:
            fake_id = "2026-08-30_faketeamx_faketeamy"
            bet = client.read_contract(
                address=ADDRESS, function_name="get_bet", args=[fake_id], account=alice
            )
            print(f"  ERROR: Fake bet was created! {bet['status']}")
        except:
            print("  Correctly not created")
    except Exception as e:
        print(f"create_bet(fake) reverted: {e}")

    # Final state
    print("\n--- Final State ---")
    try:
        bets = client.read_contract(
            address=ADDRESS, function_name="get_bets", account=alice
        )
        print(f"Total bets: {len(bets)}")
        for bid, bet in bets.items():
            print(f"  {bid}: {bet['team1']} vs {bet['team2']} | {bet['status']}")
    except Exception as e:
        print(f"get_bets failed: {e}")

    try:
        escrow = client.read_contract(
            address=ADDRESS, function_name="get_total_escrow", account=alice
        )
        print(f"Escrow: {escrow / GEN} GEN")
    except Exception as e:
        print(f"get_total_escrow failed: {e}")


if __name__ == "__main__":
    main()
