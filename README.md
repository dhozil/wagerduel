<p align="center">
  <img src="frontend/public/favicon.svg" width="110" height="110" alt="WagerDuel logo" />
</p>

<h1 align="center">
  <span style="background:linear-gradient(120deg,#FBEEC7,#EAC95C 45%,#C9992E);-webkit-background-clip:text;background-clip:text;color:transparent;">WagerDuel</span>
</h1>

<h3 align="center">Peer-to-peer head-to-head football betting on GenLayer</h3>

<p align="center">
  <b>Double or nothing.</b> Two players lock an equal stake, bet on opposite
  outcomes of a real match, and an <b>AI-verified</b> result pays the winner the pot.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg" />
  <img alt="Chain" src="https://img.shields.io/badge/chain-GenLayer%20Studio-E2B94C" />
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-Next.js%2016-000000?logo=nextdotjs" />
  <img alt="Language" src="https://img.shields.io/badge/language-Python%203.12-3776AB?logo=python" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-97%20direct-44CC11" />
</p>

---

## Highlights

- **Real escrow, no bookmaker** — both stakes are locked on-chain until the
  duel is settled. No oracles, no house edge, no middleman.
- **AI-verified outcomes** — the contract reads a trusted live source, an LLM
  extracts the result, and independent validators confirm both the winner and
  the score before a single token moves.
- **Fixture-locked bets** — `create_bet` web-fetches the resolution URL and
  uses an LLM to verify both team names exist in real fixtures for that date.
  Fake/invented team names are rejected at contract level. Users create bets
  from the Fixtures page where team names and game date are locked (no edits).
- **Match cutoff enforcement** — `join_bet` enforces two on-chain guards:
  (1) reject if match kickoff has passed (datetime-level via `kickoff_utc`, or
  date-only fallback), (2) reject if settlement window has passed ("use refund").
  Late entry is impossible.
- **Kickoff anti-forgery** — the `kickoff_utc` stored on-chain is not taken on
  faith: it is bound to the match date (a far-future kickoff is rejected at
  create time) and validator-checked against the fetched fixture (an invented
  kickoff that doesn't match the page is rejected). A false future kickoff
  cannot keep a duel joinable after the match has started.
- **Past date rejection** — `create_bet` rejects game dates in the past,
  preventing spam with old or fabricated dates.
- **Fair head-to-head rules** — opponents must bet on opposite outcomes
  (Team 1, Team 2, or Draw). A draw refunds both players.
- **Transparent economics** — a flat **2% platform fee** is the only cost; it
  accrues in `owner_fees` and never touches player balances or active escrow.
- **Funds are never locked forever** — every duel has a deterministic expiry
  refund after the match date + 14 days.
- **Escrow-rug proof** — the deployer (owner) cannot bet, and `withdraw_fees`
  is capped at accumulated fees, so active player stakes can never be drained.
- **Production-grade frontend** — Next.js 16 app with MetaMask / Rabby /
  any EIP-1193 wallet, TanStack Query, and a premium dark glass UI.

## The idea

Centralized sportsbooks control odds, hold your money, and you have to trust
them to pay out. WagerDuel inverts that: the rules live in an **intelligent
contract** on [GenLayer](https://docs.genlayer.com/) — an AI-native blockchain —
so everything is programmable, auditable, and enforced by consensus.

Instead of betting against the house, you bet against another person. Two
players, one match, one winner. Double or nothing.

## How trust works on GenLayer

This is the part that makes a no-oracle bookmaker possible:

**Bet creation (anti-spam):**
1. The contract fetches the resolution URL page with `gl.nondet.web.render(...)`.
2. An LLM checks if both team names exist in real fixtures for that date.
3. Under the **Equivalence Principle**, validators confirm the verdict — fake
   teams are rejected at contract level before any stake is locked.

**Match resolution:**
1. The contract fetches the live match page with `gl.nondet.web.render(...)`.
2. An LLM extracts the result into strict JSON: `{"score": "2:1", "winner": 1}`.
3. Under the **Equivalence Principle**, independent validators repeat the same
   check — the leader's result is accepted only if validators agree on **both**
   the winner **and** the exact score.
4. The winner's balance is credited with the pot minus the 2% fee, and a
   `BetSettled` event is emitted for on-chain auditing.

Because the resolution URL is committed by the creator and must belong to a
hardcoded allowlist of trusted hosts, the contract can never be tricked into
reading a spoofed source.

## How a duel works

```text
DEPOSIT ─▶ CREATE ─▶ JOIN ─▶ RESOLVE ─▶ COLLECT

Player A      Player A locks 5 GEN    Player B locks 5 GEN   AI reads the live    Winner gets the pot
funds their   and opens the duel      and matches the stake  result; validators   minus the 2% fee;
balance       (escrow: 5 GEN)         (escrow: 10 GEN)       verify winner + score  draw refunds both
```

1. **Deposit** — `deposit()` (payable) adds GEN to your on-chain balance.
2. **Create** — `create_bet(game_date, team1, team2, side, resolution_url, amount, handicap_halves=0)`
   deducts your stake and opens the duel. **The contract web-fetches the resolution URL and uses an LLM to verify both team names exist in real fixtures for that date** — fake teams are rejected. Game date must be in the future (past dates blocked). Pick Team 1, Team 2, or Draw and commit
   a trusted source URL (BBC, ESPN, Sky Sports, FotMob, Goal, The Guardian,
   UEFA, Premier League). Optionally set a **handicap (voor)** to level the field
   (see below). Users create bets from the Fixtures page where **team names and game date are locked**.
3. **Join** — `join_bet(bet_id, side)` locks the matching stake and seals the
   duel. Opponents must choose the opposite outcome. **On-chain cutoff enforcement**: joins are rejected after the match kickoff (datetime-level) or after the settlement window (match + 14 days).
4. **Resolve** — anyone calls `resolve_bet(bet_id)`. The contract re-reads the
   committed URL, the LLM extracts the result, and validators confirm it.
   The frontend **auto-reads the fixture feed** (ESPN + BBC) for the match date
   and keeps the Resolve button **locked until the match is full-time** — for
   upcoming fixtures it shows "Match hasn't started yet", for live games "Match
   in progress", and unlocks automatically (checked every minute) once the feed
   flips to `post`.
5. **Collect** — the winner's balance is credited with the pot minus the **2%
   platform fee**. Draws refund both players in full (no fee).

Lifecycle edges:

- **Cancel** — the creator can `cancel_bet(bet_id)` while the duel is still
  OPEN to return their stake.
- **Expiry refund** — after `match date + 14 days` without a result, anyone can
  call `refund_expired(bet_id)` — purely deterministic, so escrow always has an
  escape hatch.
- **Owner fees** — the deployer (`owner`) accumulates fees in `owner_fees` and
  can `withdraw_fees()` them out. The owner can never place bets.

## Fee Preset (transaction fees)

When you **Create Bet** (and when others **Join** or **Resolve**), the modal
asks you to pick a **Fee Preset**: `Low`, `Standard`, or `High`. This is a
**GenLayer network fee**, separate from WagerDuel's 2% platform fee — the 2%
kicks in only when a duel settles.

The preset sets how many **validation ("appeal") rounds** the GenVM spends on
your transaction under the Equivalence Principle:

| Preset | Validation rounds | Cost | When to use |
|---|---|---|---|
| **Low** | 0 appeals | Lowest | Cheap, low-stakes transactions where a single validation pass is enough |
| **Standard** | 1 appeal | Moderate | The default — good balance of cost and safety for normal duels |
| **High** | 2 appeals | Highest | Critical transactions where extra validation confidence matters |

The preset only changes how much you pay the **network** for execution, not the
platform fee — that stays 2% on settlement no matter which preset you pick.
`Standard` is recommended for everyday duels.

## Handicap (voor)

When the two sides are mismatched (e.g. Barcelona vs Leeds), the creator can
give the **opponent** a head start so the duel is fair. Handicaps are picked in
the **Create Bet** modal from `0 / +0.5 / +1 / +1.5 / +2`.

- The voor is added to the **opponent of the creator's pick**. Betting Team 1 →
  Team 2 gets the voor. Betting Team 2 → Team 1 gets the voor.
- The creator's `handicap_halves` is the handicap **applied to Team 2**, stored
  as half-goals: `+2` halves = Team 2 wins on a 1-goal win; `-2` halves = Team 1
  wins on a 1-goal win. Internally the winner is decided on adjusted scores
  (`team1_goals*2` vs `team2_goals*2 + handicap_halves`).
- Example: creator bets **Barcelona** and gives **Leeds +1** (handicap_halves = +2
  on Team 2). If Barca wins 2-1, adjusted = 4 vs 4 → a **draw on handicap** and
  **both players are refunded** (no fee). A 1-0 Barca win (2 vs 4) pays the
  Leeds bet; Barca must win by 2+ for a Barca bet to win.
- Handicaps are only allowed on **team bets** (`side` = `1` or `2`), not Draws,
  and are capped at ±2 goals (`HANDICAP_MAX_HALVES = 4`).
- A handicap of 0 means no voor — the bet settles exactly as the score.

## Contract reference

Contract: `contracts/p2p_gambling.py` — class `P2PGambling`.

| Method | Kind | Description |
|---|---|---|
| `deposit()` | write (payable) | Add GEN to your on-chain balance |
| `withdraw(amount)` | write | Send part of your balance back to your wallet |
| `create_bet(game_date, team1, team2, side, resolution_url, amount, handicap_halves=0, kickoff_utc="")` | write | Lock your stake and open a duel (validates fixtures via web fetch + LLM; optional `kickoff_utc` enables datetime-level cutoff) |
| `join_bet(bet_id, side)` | write | Match the stake on the opposite outcome (cutoff enforced) |
| `cancel_bet(bet_id)` | write | Creator refunds stake while the duel is OPEN |
| `resolve_bet(bet_id)` | write | AI-verified settlement; pays pot − 2% fee |
| `refund_expired(bet_id)` | write | Deterministic refund after match date + 14 days |
| `withdraw_fees()` | write (owner) | Move accumulated `owner_fees` to the owner |
| `get_balance(addr)` | view | On-chain balance of an address |
| `get_owner_fees()` | view | Accumulated platform fees |
| `get_bet(bet_id)` | view | Full bet state |
| `get_bets()` | view | All bets |
| `get_total_escrow()` | view | Total locked escrow |
| `get_owner()` | view | Contract owner |

**Constants**

| Constant | Value | Meaning |
|---|---|---|
| `FEE_BPS` | `200` | Platform fee: 2% (minimum 1 wei) |
| `SETTLEMENT_WINDOW_DAYS` | `14` | Days after the match date before refund eligibility |
| `TRUSTED_SOURCE_HOSTS` | `bbc.com`, `espn.com`, `skysports.com`, `fotmob.com`, `goal.com`, `theguardian.com`, `uefa.com`, `premierleague.com` (+ `www.` variants) | Allowlist of resolution sources |

**Bet statuses** — `OPEN` → `JOINED` → `RESOLVED` (or `CANCELED`), with
`EXPIRED` refunds handled deterministically.

**Events** — `BetSettled(bet_id, winner, ...)`, `Withdrawal(addr)`,
`FeesWithdrawn(addr)` are emitted on every settlement for transparent auditing.

**Security properties**

- Opponents must bet on opposite outcomes for a fair match-up.
- Resolution always re-reads the committed, creator-submitted URL — never a
  swapped or derived source.
- Validators must match the leader on the winner **and** the score, not just a
  category.
- One-time settlement guards prevent a settled duel from being paid, refunded,
  or canceled again.
- **Match cutoff enforcement**: `join_bet` rejects after match kickoff or settlement window.
- **Past date rejection**: `create_bet` rejects game dates in the past.
- **Fixture validation**: `create_bet` verifies team names via web fetch + LLM.
- `withdraw_fees` is owner-only, capped at accumulated fees — active player
  stakes can never be drained (escrow-rug proof).
- The owner cannot place bets (anti-manipulation).
- Fund-conservation tests verify `total_escrow` and balances stay consistent
  through every lifecycle transition.

## Tech stack

| Layer | Technology |
|---|---|
| Blockchain | GenLayer (GenVM intelligent contracts, Equivalence Principle) |
| Contract language | Python 3.12 (GenLayer SDK) |
| Frontend | Next.js 16, React 19, TypeScript |
| UI | Tailwind CSS v4, Radix UI, shadcn/ui, TanStack Query |
| Web3 | genlayer-js, viem, wagmi (EIP-1193 wallets) |
| Testing | pytest (direct mode), genvm-lint, gltest (integration) |

## Repository layout

```text
contracts/
  p2p_gambling.py          # The P2PGambling intelligent contract
tests/
  direct/                  # 97 fast in-memory tests (no Studio required)
  integration/             # End-to-end tests against a GenLayer backend
frontend/                  # Next.js 16 app (TypeScript, TanStack Query, Radix UI)
deploy/
  deploy_studionet.py      # Deploy to Studio / Bradbury / local GLSim
gltest.config.yaml         # Integration test network config
.github/workflows/ci.yml   # Lint + direct tests
```

## Getting started

### Requirements

- Python >= 3.12
- Node.js >= 20 (for the frontend)
- [GenLayer CLI](https://docs.genlayer.com/) (`npm install -g genlayer`) for
  deployment
- A GenLayer network: hosted [GenLayer Studio](https://studio.genlayer.com/)
  (chain `61999`) or a local GLSim

### Python environment

```shell
python -m venv .venv
.\.venv\Scripts\activate        # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

### Lint & test the contract

```shell
genvm-lint lint contracts/p2p_gambling.py   # static analysis
pytest tests/direct/ -v                      # 97 fast direct-mode tests
gltest tests/integration/ -v -s              # on-chain integration tests
```

### Deploy

```shell
python deploy/deploy_studionet.py studionet      # hosted Studio simulator
python deploy/deploy_studionet.py bradbury       # testnet Bradbury
python deploy/deploy_studionet.py localnet       # local GLSim
```

Deployer keys are read from the gitignored `.env` (per-network owner key).

### Frontend

```shell
cd frontend
cp .env.example .env          # set NEXT_PUBLIC_CONTRACT_ADDRESS + network
npm install
npm run dev
```

Open http://localhost:3000/.

The app connects through any **EVM-compatible wallet** (MetaMask, Rabby,
Coinbase Wallet, Trust, ...) via the EIP-1193 provider. For the most reliable
GenLayer transaction signing, use **Rabby** or **MetaMask with the GenLayer
Snap**.

## Deployed contract

| Network | Address |
|---|---|
| GenLayer Studio (chain `61999`) | `0xFed4C6551D4FC4e20a4214AD144Fe9a5F36dA298` |

On-chain verification (all finalizing, ~40s/tx on studionet):

- **Integration suite** — `gltest tests/integration/ -v -s --network studionet`
  deploys **once** and runs 8 tests against a single contract with two player
  accounts: schema, deposit/create/escrow, join + duplicate rejection, withdraw
  & views, cancel, expiry refund, handicap create/join, handicap validation.
- **Live smoke** — `python deploy/smoke_test_deployed.py --resolve` exercises the
  deployed contract directly: deposit, create (with handicap), join,
  `refund_expired` (deterministic, no sim config), and a **real AI resolve** of
  Spain 1-0 Italy (2024-06-20) paying the winner minus the 2% fee, then owner
  `withdraw_fees`.
- **Steward-request security** — `python deploy/test_steward_security.py <address>`
  proves the steward requirements live on studionet: a **false future kickoff**
  and a **forged kickoff that doesn't match the fixture** are both rejected and
  never stored, while a real fixture + correct kickoff is accepted.
- **Results** — `deploy/RESULTS_studionet.md` documents the recorded studionet
  execution output (34 checks, 0 failures) for submission evidence.

## Roadmap

- Additional sports (basketball, tennis, esports)
- More bet types (over/under, correct score, full Asian handicap)
- Multi-game parlays
- Player leaderboards and achievements
- Appeals / dispute escalation with higher fee tiers

## License

MIT — see [LICENSE](LICENSE).
