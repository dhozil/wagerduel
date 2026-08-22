"""Combined clean studionet run on a FRESH contract.

Runs BOTH the steward-request security suite and the remaining-methods suite in
one process so the contract starts empty (steward suite requires it) and then
the remaining methods run on the created state. Fixtures are distinct between
the two suites, so no duplicate-bet collisions occur.

Usage:
    python deploy/test_all_studionet.py <fresh_contract_address>
"""

import runpy
import sys

if len(sys.argv) < 2:
    raise SystemExit("usage: python deploy/test_all_studionet.py <address>")

ADDRESS = sys.argv[1]

sys.argv = ["test_steward_security.py", ADDRESS]
runpy.run_path("deploy/test_steward_security.py", run_name="__main__")
print("\n\n========== STEWARD SUITE DONE, RUNNING REMAINING ==========\n")

sys.argv = ["test_remaining_methods.py", ADDRESS]
runpy.run_path("deploy/test_remaining_methods.py", run_name="__main__")
print("\n\n========== COMBINED RUN COMPLETE ==========")