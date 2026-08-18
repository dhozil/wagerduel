# WagerDuel

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![GenLayer](https://img.shields.io/badge/chain-GenLayer%20Studio-E2B94C)
![Next.js](https://img.shields.io/badge/frontend-Next.js%2016-000000)

**Peer-to-peer head-to-head football betting on GenLayer.** Two players lock an
equal stake in escrow, bet on opposite outcomes of a real match, and an
AI-verified result pays the winner the pot. No oracles, no bookmakers, no house
edge — double or nothing.

---

## What is WagerDuel

WagerDuel is a decentralized football betting dApp built as a **GenLayer
Intelligent Contract** (`P2PGambling`) with a production-ready Next.js frontend.
The contract itself reads a trusted live source on-chain, extracts the match
result with an LLM, and has **independent validators** verify both the winner
and the score under the [Equivalence Principle](https://docs.genlayer.com/)
before any funds move.

Everything runs on-chain and is auditable:

- **Balance model** — you deposit GEN into the contract and fund bets from your
  balance. Winnings are credited to your balance and can be withdrawn anytime.
- **Real escrow** — both stakes are locked in the contract until the duel is
  settled, refunded, or expired.
- **No admin control over funds** — the owner cannot bet and can only withdraw
  the accumulated platform fee, never user balances or active escrow.
- **Bounded settlement** — every duel has a deterministic expiry refund, so
  escrow can never be locked forever.

## How it works

```text
  1. DEPOSIT         2. CREATE           3. JOIN              4. RESOLVE         5. COLLECT
  ┌──────────┐      ┌─────────────┐     ┌─────────────┐      ┌────────────┐      ┌──────────┐
  │  Player A │ ──▶ │ A locks 5 GEN │ ─▶ │ B locks 5 GEN │ ─▶ │  AI reads  │ ─▶ │ Winner   │
  │ balance   │      │ opens duel  │     │ matches stake│     │  result +  │     │ gets pot │
  │ + 5 GEN   │      │ (ESCROW 5)  │     │ (ESCROW 10) │     │  validators│     │ − 2% fee │
  └──────────┘      └─────────────┘     └─────────────┘      └────────────┘      └──────────┘
```

1. **Deposit** — `deposit()` (payable) adds GEN to your on-chain balance.
2. **Create** — `create_bet(game_date, team1, team2, side, resolution_url, amount)`
   deducts your stake and opens the duel. You pick Team 1, Team 2, or Draw, and
   commit a trusted source URL (BBC, ESPN, Sky Sports, FotMob, Goal, The
   Guardian, UEFA, Premier League).
3. **Join** — `join_bet(bet_id, side)` locks the matching stake and seals the
   duel. Opponents must bet on opposite outcomes.
4. **Resolve** — anyone calls `resolve_bet(bet_id)`. The contract renders the
   committed URL, an LLM extracts `{winner, score}`, and validators independently
   repeat the check. Only if leader and validators agree on **both** the winner
   and the score is the result accepted.
5. **Collect** — the winner's balance is credited with the pot minus a flat
   **2% platform fee**. Draws refund both players (no fee).

Lifecycle edges:

- **Cancel** — the creator can `cancel_bet(bet_id)` while the duel is still
  OPEN to return their stake.
- **Expiry refund** — after `match date + 14 days` without a result, anyone can
  call `refund_expired(bet_id)` — purely deterministic, so escrow always has an
  escape hatch.
- **Owner fees** — the deployer (`owner`) accumulates fees in `owner_fees` and
  can `withdraw_fees()` them out. The owner can never place bets.

## Contract reference

Public methods (`contracts/p2p_gambling.py`):

| Method | Kind | Description |
|---|---|---|
| `deposit()` | write (payable) | Add GEN to your on-chain balance |
| `withdraw(amount)` | write | Send part of your balance back to your wallet |
| `create_bet(game_date, team1, team2, side, resolution_url, amount)` | write | Lock your stake and open a duel |
| `join_bet(bet_id, side)` | write | Match the stake on the opposite outcome |
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

Constants:

- **Platform fee** — `FEE_BPS = 200` (2%), minimum 1 wei.
- **Settlement window** — `SETTLEMENT_WINDOW_DAYS = 14` after the match date.
- **Trusted source hosts** — `bbc.com`, `espn.com`, `skysports.com`,
  `fotmob.com`, `goal.com`, `theguardian.com`, `uefa.com`,
  `premierleague.com` (and `www.` variants). Lookalike hosts are rejected.

On-chain events: `BetSettled(bet_id, winner, ...)`, `Withdrawal(addr)`,
`FeesWithdrawn(addr)` — emitted on every settlement for transparent auditing.

**Security properties**

- Both players must bet on opposite outcomes for a fair match-up.
- Resolution always re-reads the committed, creator-submitted URL — never a
  swapped or derived source.
- Validators must match the leader on the winner **and** the score, not just a
  category.
- One-time settlement guards prevent a settled duel from being paid, refunded,
  or canceled again.
- `withdraw_fees` is owner-only, capped at accumulated fees — active player
  stakes can never be drained (escrow-rug proof).
- The owner cannot place bets (anti-manipulation).
- Fund-conservation tests verify `total_escrow` and balances stay consistent
  through every lifecycle transition.

## Repository layout

```text
contracts/
  p2p_gambling.py          # The P2PGambling intelligent contract
tests/
  direct/                  # Fast in-memory tests (no Studio required)
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
pytest tests/direct/ -v                      # fast direct-mode tests
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
Snap`.

## Deployed contract

| Network | Address |
|---|---|
| GenLayer Studio | `0xC0C1F6AdEFB3ECc794fBDF3B7224e9BE95D0ac1c` |

## License

MIT — see [LICENSE](LICENSE).
