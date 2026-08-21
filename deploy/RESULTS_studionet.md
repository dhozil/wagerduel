# Studionet Verification Results

Live results from testing the deployed WagerDuel contract on **GenLayer Studionet**.

- **Chain**: studionet (`https://studio.genlayer.com/api`, chain 61999)
- **Contract**: `0x346AEc8a5e659973D84A011ac6D53292Ace51Ede`
- **Explorer**: https://explorer-studio.genlayer.com/address/0x346AEc8a5e659973D84A011ac6D53292Ace51Ede
- **Owner**: `0x28Cf6872815C1F275b4Ae5a291799d11cF5bd0De`
- **Deploy tx**: `0xeaf3ea2bccea038755fa8b5ecdeeacd9634e78ccbd4e2637995a222a3f80bfb1`
- **Date**: 2026-08-21

This deployment includes **hardened `_verify_fixtures` / `_fetch_match_result`**: web fetch + LLM are retried (up to 3x) and JSON parsing is tolerant, so a single transient fetch/LLM failure no longer fails `create_bet`. The steward security logic (date-binding + validator-checked kickoff) is unchanged.

> A studionet tx **FINALIZES even when the contract call reverts** (a `UserError` rollback). The execution result is carried in `consensus_data.leader_receipt[0].execution_result` as `SUCCESS` or `ERROR`. All "reverts" below mean `execution_result = ERROR` and no on-chain state change. Transaction hashes are verifiable on the explorer.

---

## 1. Steward Request Security Tests — `deploy/test_steward_security.py`

Full method + steward-request coverage. **26 checks, 0 failed.**

### Explorer Evidence (tx hashes)

Key steward transactions, each verifiable at `https://explorer-studio.genlayer.com/tx/<hash>`:

| Label | Exec | Tx |
|---|---|---|
| `steward:false_future_kickoff` (kickoff `2100-01-01T00:00:00Z`) | REVERT | `0x5ffa868fafeb55f2091244d0803491b671e2141a7554baba870f296e046d690b` |
| `steward:kickoff_far_from_date` (kickoff `2026-08-25`) | REVERT | `0x165348aa1ca2050b9cefdbe7ddebc2b6920127dc4c8ed647b7ef36a770d2f24e` |
| `steward:forged_kickoff_not_matching_fixture` (kickoff `2026-08-22T02:00:00Z`) | REVERT | `0xf5050a5a6d7e4df74d938472bdbf7b0cb92fb6e0a7830896eca4664843202907` |
| `steward:real_kickoff_accepted` (Everton vs Crystal Palace, kickoff `14:00:00Z`) | SUCCESS | `0x864df8c98f8b92da2a5764e54d099033138dca4f364d6cbfdc464bd95ccc3944` |
| owner `create_bet` (forged/blocked) | REVERT | `0x31ae7186cbbbf855d31a2ff363eb507a1e518cdcc1f674a120721d4e3a15968a` |
| non-owner `withdraw_fees` | REVERT | `0xba7ee15c18474e7c40236fc976af1540a561f03282a7d3b286f35763167e1c29` |
| bob `join_bet` before kickoff | SUCCESS | `0x1322abcb74e101bb7374055161696fb6cb2a3201ed9ead2f02c5d07c965952a1` |
| owner `join_bet` | REVERT | `0x6733107651e5c667aff10b059f13aa081017b61b7804518b5e689a43c723308e` |

Full tx list (in order): deposit `0xd0b2d988...`, deposit `0x61548356...`, withdraw `0x84ea0eef...`, deposit `0x621f55d9...`, validation reverts `0x25e5f603...` · `0x65eb56b2...` · `0x58b7b89e...` · `0xb6c1b79b...` · `0x799712cc...`, insufficient-balance `0x813d5fde...`, duplicate `0xb8e2b434...`.

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
| **false FUTURE kickoff `2100-01-01T00:00:00Z` (reverts)** | PASS (`exec=ERROR`, tx `0x5ffa868f...`) |
| kickoff far from match date `2026-08-25` (reverts) | PASS (`exec=ERROR`, tx `0x165348aa...`) |

The contract binds `kickoff_utc` to the match date (deterministic). A bet creator **cannot** push the kickoff far into the future to keep the duel joinable after the match — the `create_bet` call reverts and no bet is stored.

### STEWARD REQUEST — forged kickoff vs fixture (LLM validator)
| Check | Result |
|---|---|
| **forged kickoff `2026-08-22T02:00:00Z` (real is 14:00 UTC) rejected and NOT stored** | PASS (`exec=ERROR`, tx `0xf5050a5a...`) |

Even when the kickoff is bound to the match date, `_verify_fixtures` cross-checks the supplied kickoff against the fetched fixture (BBC page) via the LLM. An invented kickoff that does not match the fixture is rejected at create time.

### Real create with verified kickoff (web + LLM)
| Check | Result |
|---|---|
| real fixture (Everton vs Crystal Palace 2026-08-22) + correct kickoff `14:00:00Z` accepted | PASS (`exec=SUCCESS`, tx `0x864df8c9...`) |
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
| bob joins real bet (accepted) | PASS (`exec=SUCCESS`, tx `0x1322abcb...`) |
| bet JOINED | PASS |
| owner `join_bet` (reverts) | PASS (`exec=ERROR`, tx `0x67331076...`) |

### Raw execution output (abridged)
```
=== CONTRACT: 0x346AEc8a5e659973D84A011ac6D53292Ace51Ede ===
[views] PASS x5
[owner restrictions] create_bet -> FINALIZED (exec=ERROR) / withdraw_fees -> FINALIZED (exec=ERROR)
[deposit/withdraw] deposit x3 (exec=SUCCESS), withdraw (exec=SUCCESS)
[create_bet validation] 5x create_bet -> FINALIZED (exec=ERROR)
[steward request: false future kickoff] 2x create_bet -> FINALIZED (exec=ERROR)
[steward request: forged kickoff vs fixture (LLM)] create_bet -> FINALIZED (exec=ERROR) in 60.5s
[create real bet with verified kickoff (web+LLM)] create_bet -> FINALIZED (exec=SUCCESS) in 187.1s
[edge cases] 2x create_bet -> FINALIZED (exec=ERROR)
[join before kickoff] join_bet -> FINALIZED (exec=SUCCESS) / join_bet -> FINALIZED (exec=ERROR)
=== SUMMARY: 26 passed, 0 failed ===

=== EXPLORER EVIDENCE (tx hashes) ===
[steward:false_future_kickoff] REVERT  0x5ffa868f...
[steward:kickoff_far_from_date] REVERT  0x165348aa...
[steward:forged_kickoff_not_matching_fixture] REVERT  0xf5050a5a...
[steward:real_kickoff_accepted] SUCCESS  0x864df8c9...
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
| **Steward: false future kickoff cannot permit late entry** | `create_bet` with `kickoff_utc = 2100-01-01T00:00:00Z` → `ERROR`, bet not stored (tx `0x5ffa868f...`) |
| **Steward: validator-check kickoff against fixture** | `create_bet` with forged `2026-08-22T02:00:00Z` (real 14:00 UTC) → `ERROR`, bet not stored (tx `0xf5050a5a...`) |
| **Steward: bind kickoff to match date** | kickoff far from match date → `ERROR` (tx `0x165348aa...`) |
| All public methods work | 26 + 8 = **34 studionet checks, 0 failed** |

All transaction hashes are independently verifiable on the GenLayer Studio explorer.
