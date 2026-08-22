# Studionet Verification Results

Live results from testing the deployed WagerDuel contract on **GenLayer Studionet**.

- **Chain**: studionet (`https://studio.genlayer.com/api`, chain 61999)
- **Contract**: `0xFed4C6551D4FC4e20a4214AD144Fe9a5F36dA298`
- **Explorer**: https://explorer-studio.genlayer.com/address/0xFed4C6551D4FC4e20a4214AD144Fe9a5F36dA298
- **Owner**: `0x28Cf6872815C1F275b4Ae5a291799d11cF5bd0De`
- **Deploy tx**: `0x98051c6ed452d6b0e4ea991f53bd56c747c82d1a72a3effcd2a5468fa3659933`
- **Date**: 2026-08-21

**Steward-request fix (fail-closed kickoff integrity):** the creator's `kickoff_utc`
is persisted on-chain **only if the fixture source affirmatively verifies it**
(`valid_kickoff === true`). If the fixture page shows no kickoff, the LLM omits
`valid_kickoff`, or the timestamps disagree, the creator's kickoff is **dropped
to `""`** and the bet falls back to the stricter date-only cutoff — a later
same-day cutoff is never trusted without source verification.

> A studionet tx **FINALIZES even when the contract call reverts** (a `UserError` rollback). The execution result is carried in `consensus_data.leader_receipt[0].execution_result` as `SUCCESS` or `ERROR`. All "reverts" below mean `execution_result = ERROR` and no on-chain state change unless noted. Transaction hashes are verifiable on the explorer.

---

## 1. Steward Request Security Tests — `deploy/test_steward_security.py`

Full method + steward-request coverage. **28 checks, 0 failed.**

### Explorer Evidence (tx hashes)

Key steward transactions, each verifiable at `https://explorer-studio.genlayer.com/tx/<hash>`:

| Label | Exec | Tx |
|---|---|---|
| `steward:false_future_kickoff` (kickoff `2100-01-01T00:00:00Z`) | REVERT | `0x728e84bebcf9de536cfaa19cd1e1bd63591936d5e65c339e566c2c2266641b99` |
| `steward:kickoff_far_from_date` (kickoff `2026-08-25`) | REVERT | `0x92418588b691e090de31389854f29e5b68f64b00626cb228b6327c7ed432ed3a` |
| `steward:forged_kickoff_not_matching_fixture` (kickoff `2026-08-22T02:00:00Z`, real 14:00 UTC) | SUCCESS but kickoff `''` | `0x09a374d972b26e915a3f00abfe584e1be46518ffe4c8dfe8c095f11d5d65da42` |
| `steward:real_kickoff_accepted` (Man City vs Bournemouth, kickoff `13:00:00Z`) | SUCCESS, kickoff stored | `0x6a48359a2c3e3a710280421f5e0141f73992a37ad0233c7a1b004aef5431480b` |
| owner `create_bet` (reverts) | REVERT | `0x5062a4875118a1d2addad8da44e41e5a7420bdbb7e01d4b5c2661234354d1d0f` |
| non-owner `withdraw_fees` | REVERT | `0xdf331d24104753145ef935bc52659e919fca8520f02996f3874f60ad99d9cbf5` |
| bob `join_bet` before kickoff | SUCCESS | `0x9ae5a057acf7364e6be9cc2502c878990b6203a2a5f7f68b317702fe6d1c2108` |
| owner `join_bet` | REVERT | `0x1dad060397897f92f39ac3821ab49f004f77a28081a389c9edb280d9e969798f` |

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
| **false FUTURE kickoff `2100-01-01T00:00:00Z` (reverts)** | PASS (`exec=ERROR`, tx `0x728e84beb...`) |
| kickoff far from match date `2026-08-25` (reverts) | PASS (`exec=ERROR`, tx `0x92418588b...`) |

The contract binds `kickoff_utc` to the match date (deterministic). A bet creator **cannot** push the kickoff far into the future to keep the duel joinable after the match — the `create_bet` call reverts and no bet is stored.

### STEWARD REQUEST — forged kickoff vs fixture (LLM validator, FAIL-CLOSED)
| Check | Result |
|---|---|
| **forged kickoff `2026-08-22T02:00:00Z` (real is 14:00 UTC): bet created but kickoff NOT persisted** | PASS (`kickoff_utc == ""`) |
| **forged kickoff cannot permit same-day late entry** | PASS (empty kickoff → date-only cutoff) |

Even though the forged kickoff passes the date-binding check (same date), `_verify_fixtures`
does NOT affirm it. The contract **fails closed**: the creator's kickoff is dropped
(`kickoff_utc == ""`) so `join_bet` uses the date-only cutoff, which blocks ALL same-day
joins — a later same-day cutoff is never accepted without affirmative source verification.

### Real create with verified kickoff (web + LLM)
| Check | Result |
|---|---|
| real fixture (Man City vs Bournemouth 2026-08-23) + correct kickoff `13:00:00Z` accepted | PASS (`exec=SUCCESS`, tx `0x6a48359a2...`) |
| `kickoff_utc` stored = `2026-08-23T13:00:00Z` | PASS |
| bet status OPEN | PASS |

### Edge cases
| Check | Result |
|---|---|
| insufficient balance (reverts) | PASS (`exec=ERROR`) |
| duplicate bet (reverts) | PASS (`exec=ERROR`) |

### Join before kickoff
| Check | Result |
|---|---|
| bob joins real bet (accepted) | PASS (`exec=SUCCESS`, tx `0x9ae5a057a...`) |
| bet JOINED | PASS |
| owner `join_bet` (reverts) | PASS (`exec=ERROR`, tx `0x1dad06039...`) |

---

## 2. Remaining Methods — `deploy/test_remaining_methods.py`

Runs on the same contract after the steward suite. **8 checks, 0 failed.**

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

## 3. Direct-Mode Fail-Closed Branch Tests — `tests/direct/test_p2p_join_cutoff.py`

These cover the fail-open branches the steward flagged (16 tests, all passing):

| Test | Asserts |
|---|---|
| `test_create_bet_forged_kickoff_not_persisted_fail_closed` | forged kickoff not matching fixture → `kickoff_utc == ""`, same-day join reverts |
| `test_create_bet_page_without_kickoff_drops_kickoff` | page shows no kickoff → creator kickoff dropped |
| `test_create_bet_omitted_valid_kickoff_drops_kickoff` | LLM omits `valid_kickoff` → treated as unverified, kickoff dropped |
| `test_create_bet_explicit_valid_kickoff_persisted` | only affirmatively verified kickoff is stored |
| `test_create_bet_false_future_kickoff_reverts` | kickoff 50 years in future → revert |

`pytest tests/direct/` → **95 passed**.

---

## 4. Summary

| Requirement | Evidence |
|---|---|
| **Steward: false future kickoff cannot permit late entry** | `create_bet` with `kickoff_utc = 2100-01-01T00:00:00Z` → `ERROR`, bet not stored (tx `0x728e84beb...`) |
| **Steward: validator-check kickoff against fixture, fail-closed** | forged `2026-08-22T02:00:00Z` → bet created but `kickoff_utc == ""`; date-only cutoff blocks same-day (tx `0x09a374d97...`) |
| **Steward: bind kickoff to match date** | kickoff far from match date → `ERROR` (tx `0x92418588b...`) |
| **Steward: no fail-open when page omits kickoff / response omits valid_kickoff** | direct tests `test_create_bet_page_without_kickoff_drops_kickoff`, `test_create_bet_omitted_valid_kickoff_drops_kickoff`, `test_create_bet_forged_kickoff_not_persisted_fail_closed` |
| All public methods work | **36 studionet checks, 0 failed** (28 steward + 8 remaining) + 95 direct tests |

All transaction hashes are independently verifiable on the GenLayer Studio explorer.