"""Deploy the WagerDuel contract to a GenLayer network.

Usage:
    python deploy/deploy_studionet.py [network]

Networks: studionet (default), bradbury, localnet
The deployer key is read from the gitignored .env file
(STUDIO_OWNER_PRIVATE_KEY / BRADBURY_OWNER_PRIVATE_KEY).
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import localnet, studionet, testnet_bradbury
from genlayer_py.types import TransactionStatus

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "p2p_gambling.py"

NETWORKS = {
    "studionet": (studionet, "STUDIO_OWNER_PRIVATE_KEY"),
    "bradbury": (testnet_bradbury, "BRADBURY_OWNER_PRIVATE_KEY"),
    "localnet": (localnet, "STUDIO_OWNER_PRIVATE_KEY"),
}


def main() -> None:
    network = sys.argv[1] if len(sys.argv) > 1 else "studionet"
    if network not in NETWORKS:
        raise SystemExit(f"Unknown network: {network}")
    chain, key_env = NETWORKS[network]

    load_dotenv(ROOT / ".env")
    key = os.environ.get(key_env)
    if not key:
        raise SystemExit(f"Missing {key_env} in .env")

    account = create_account(key)
    client = create_client(chain=chain, account=account)

    code = CONTRACT.read_bytes()
    tx_hash = client.deploy_contract(code=code)
    print("deploy tx:", tx_hash)

    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        interval=10000,
        retries=60,
    )

    if receipt.get("status_name") not in ("ACCEPTED", "FINALIZED"):
        raise SystemExit(f"Deployment failed: {receipt}")

    address = (
        receipt.get("txDataDecoded", {}).get("contractAddress")
        or receipt.get("data", {}).get("contract_address")
    )
    print(f"WagerDuel deployed at: {address}")
    print(f"Owner: {account.address}")


if __name__ == "__main__":
    main()
