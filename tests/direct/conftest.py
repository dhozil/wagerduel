"""Shared helpers for direct mode tests."""

import os
import sys
import tempfile

import pytest

RESOLUTION_URL = (
    "https://www.bbc.com/sport/football/scores-fixtures/2050-06-20"
)

FIXTURES_MOCK_HTML = """
Scores and Fixtures for 20 June 2050

Football - International Friendly

Spain vs Italy - Kick-off 20:00
Denmark vs England - Kick-off 18:00
Germany vs France - Kick-off 19:00
Japan vs South Korea - Kick-off 17:00
Brazil vs Argentina - Kick-off 21:00
Portugal vs Netherlands - Kick-off 20:00
Belgium vs Switzerland - Kick-off 18:30
Sweden vs Norway - Kick-off 19:00
Aliceteam vs Bobteam - Kick-off 15:00
PastTeamA vs PastTeamB - Kick-off 14:00
"""


def fund(vm, contract, addr, amount):
    """Deposit `amount` into `addr`'s on-chain contract balance."""
    vm.sender = addr
    vm.value = amount
    contract.deposit()


@pytest.fixture(autouse=True)
def _mock_fixtures_web(direct_vm):
    """Mock web render and LLM for _verify_fixtures in create_bet.

    The web mock returns fixtures HTML listing common test team names.
    The LLM mock always responds with valid=true for the fixture verifier prompt.
    """
    direct_vm.mock_web(r".*bbc\.com.*scores-fixtures.*", {
        "status": 200,
        "body": FIXTURES_MOCK_HTML,
    })
    direct_vm.mock_web(r".*espn\.com.*", {
        "status": 200,
        "body": FIXTURES_MOCK_HTML,
    })
    direct_vm.mock_web(r".*bbc\.co\.uk.*", {
        "status": 200,
        "body": FIXTURES_MOCK_HTML,
    })
    direct_vm.mock_llm(
        r".*football fixture verifier.*",
        '{"valid": true, "valid_kickoff": true}',
    )


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


def warp_datetime(vm, iso_timestamp: str) -> None:
    """Warp both the internal clock AND gl.message_raw['datetime'].

    The gltest SDK's vm.warp() only updates self._datetime but _refresh_gl_message()
    never propagates it to gl.message_raw['datetime']. This helper fixes that.
    """
    import sys

    vm.warp(iso_timestamp)
    if 'genlayer.gl' in sys.modules:
        gl = sys.modules['genlayer.gl']
        if hasattr(gl, 'message_raw') and gl.message_raw is not None:
            gl.message_raw['datetime'] = iso_timestamp


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
