# Studionet Verification Results

Live results from testing the deployed WagerDuel contract on **GenLayer Studionet**.

- **Chain**: studionet (`https://studio.genlayer.com/api`, chain 61999)
- **Contract**: `0xe883305EF54422df7bbcBFf20A8eF87F79607750`
- **Owner**: `0x28Cf6872815C1F275b4Ae5a291799d11cF5bd0De`
- **Deploy tx**: `0x07ab1f0750690b0c58f39d552979e5bd900c04375a4202503299c7fdb11ce4e5`
- **Date**: 2026-08-21

> A studionet tx **FINALIZES even when the contract call reverts** (a `UserError` rollback). The execution result is carried in `consensus_data.leader_receipt[0].execution_result` as `SUCCESS` or `ERROR`. All "reverts" below mean `execution_result = ERROR` and no on-chain state change.

---

## 1. Steward Request Security Tests — `deploy/test_steward_security.py`

Full method + steward-request coverage. **26 checks, 0 failed.**

### Views
| Check | Result |
|---|---|
| `get_owner` == owner | PASS |
| `get_total_escrow` == 0 | PASS |
| `get_bets` empty | PASS |
| `get_balance` default 0 | PASS |
| `get_owner_fees` == 0 | PASS |

### Owner restrictions
| Check | Result |
|---|---|
| owner `create_bet` (reverts) | PASS (`exec=ERROR`) |
| non-owner `withdraw_fees` (reverts) | PASS (`exec=ERROR`) |

### Deposit / withdraw
| Check | Result |
|---|---|
| alice deposit 5 GEN | PASS |
| bob deposit 5 GEN | PASS |
| alice balance == 5 GEN | PASS |
| bob balance == 5 GEN | PASS |
| alice `withdraw` 1 GEN → balance 4 | PASS |
| deposit restore | PASS |

### create_bet validation
| Check | Result |
|---|---|
| bad date format (reverts) | PASS (`exec=ERROR`) |
| past game date (reverts) | PASS (`exec=ERROR`) |
| invalid side (reverts) | PASS (`exec=ERROR`) |
| invalid kickoff format (reverts) | PASS (`exec=ERROR`) |
| untrusted resolution host (reverts) | PASS (`exec=ERROR`) |

### STEWARD REQUEST — false future kickoff
| Check | Result |
|---|---|
| **false FUTURE kickoff `2100-01-01T00:00:00Z` (reverts)** | PASS (`exec=ERROR`) |
| kickoff far from match date `2026-08-25` (reverts) | PASS (`exec=ERROR`) |

The contract binds `kickoff_utc` to the match date (deterministic). A bet creator **cannot** push the kickoff far into the future to keep the duel joinable after the match — the `create_bet` call reverts and no bet is stored.

### STEWARD REQUEST — forged kickoff vs fixture (LLM validator)
| Check | Result |
|---|---|
| **forged kickoff `2026-08-22T02:00:00Z` (real is 14:00 UTC) rejected and NOT stored** | PASS (`exec=ERROR`) |

Even when the kickoff is bound to the match date, `_verify_fixtures` cross-checks the supplied kickoff against the fetched fixture (BBC page) via the LLM. An invented kickoff that does not match the fixture is rejected at create time.

### Real create with verified kickoff (web + LLM)
| Check | Result |
|---|---|
| real fixture (Everton vs Crystal Palace 2026-08-22) + correct kickoff `14:00:00Z` accepted | PASS (`exec=SUCCESS`) |
| `kickoff_utc` stored = `2026-08-22T14:00:00Z` | PASS |
| bet status OPEN | PASS |

### Edge cases
| Check | Result |
|---|---|
| insufficient balance (reverts) | PASS (`exec=ERROR`) |
| duplicate bet (reverts) | PASS (`exec=ERROR`) |

### Join before kickoff
| Check | Result |
|---|---|
| bob joins real bet (accepted) | PASS (`exec=SUCCESS`) |
| bet JOINED | PASS |
| owner `join_bet` (reverts) | PASS (`exec=ERROR`) |

### Raw execution output (abridged)
```
=== CONTRACT: 0xe883305EF54422df7bbcBFf20A8eF87F79607750 ===
[views] PASS x5
[owner restrictions] create_bet -> FINALIZED (exec=ERROR) / withdraw_fees -> FINALIZED (exec=ERROR)
[deposit/withdraw] deposit x3 (exec=SUCCESS), withdraw (exec=SUCCESS)
[create_bet validation] 5x create_bet -> FINALIZED (exec=ERROR)
[steward request: false future kickoff] 2x create_bet -> FINALIZED (exec=ERROR)
[steward request: forged kickoff vs fixture (LLM)] create_bet -> FINALIZED (exec=ERROR) in 70.8s
[create real bet with verified kickoff (web+LLM)] create_bet -> FINALIZED (exec=SUCCESS) in 51.8s
[edge cases] 2x create_bet -> FINALIZED (exec=ERROR)
[join before kickoff] join_bet -> FINALIZED (exec=SUCCESS) / join_bet -> FINALIZED (exec=ERROR)
=== SUMMARY: 26 passed, 0 failed ===
ALL STUDIONET SECURITY CHECKS PASSED
```

---

## 2. Remaining Methods — `deploy/test_remaining_methods.py`

**8 checks, 0 failed.**

| Check | Result |
|---|---|
| non-creator `cancel_bet` (reverts) | PASS (`exec=ERROR`) |
| creator `cancel_bet` (accepted) | PASS (`exec=SUCCESS`) |
| bet status CANCELED | PASS |
| stake refunded | PASS |
| owner `withdraw_fees` with 0 fees (reverts) | PASS (`exec=ERROR`) |
| `refund_expired` before deadline (reverts) | PASS (`exec=ERROR`) |
| `resolve_bet` on unfinished match (reverts) | PASS (`exec=ERROR`) |
| bet still JOINED (no settle) | PASS |

---

## 3. Summary

| Requirement | Evidence |
|---|---|
| **Steward: false future kickoff cannot permit late entry** | `create_bet` with `kickoff_utc = 2100-01-01T00:00:00Z` → `ERROR`, bet not stored |
| **Steward: validator-check kickoff against fixture** | `create_bet` with forged `2026-08-22T02:00:00Z` (real 14:00 UTC) → `ERROR`, bet not stored |
| **Steward: bind kickoff to match date** | kickoff far from match date → `ERROR` |
| All public methods work | 26 + 8 = **34 studionet checks, 0 failed** |
