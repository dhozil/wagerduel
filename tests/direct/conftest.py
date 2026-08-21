"""Shared helpers for direct mode tests."""

import os
import sys
import tempfile

import pytest

RESOLUTION_URL = (
    "https://www.bbc.com/sport/football/scores-fixtures/2050-06-20"
)


def fund(vm, contract, addr, amount):
    """Deposit `amount` into `addr`'s on-chain contract balance."""
    vm.sender = addr
    vm.value = amount
    contract.deposit()


@pytest.fixture(autouse=True)
def _windows_unlink_workaround(monkeypatch):
    """Windows: gltest's _inject_message_to_fd0 replaces stdin with a temp file
    then tries to unlink it while the handle is still open, raising
    PermissionError. Swallow that harmless cleanup error on Windows only."""
    if os.name != "nt":
        return

    real_unlink = os.unlink
    tmp_root = tempfile.gettempdir().lower()

    def tolerant_unlink(path):
        try:
            real_unlink(path)
        except PermissionError:
            if str(path).lower().startswith(tmp_root):
                return
            raise

    monkeypatch.setattr(sys.modules["os"], "unlink", tolerant_unlink)


def to_hex(addr_bytes):
    """Convert address bytes to checksummed hex matching contract output.

    The contract's get_bets()/get_points() return keys via Address.as_hex,
    which produces EIP-55 checksummed hex. Call after direct_deploy so the
    SDK is on sys.path.
    """
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex
