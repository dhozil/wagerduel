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
2. **Create** — `create_bet(game_date, team1, team2, side, resolution_url, amount)`
   deducts your stake and opens the duel. Pick Team 1, Team 2, or Draw and commit
   a trusted source URL (BBC, ESPN, Sky Sports, FotMob, Goal, The Guardian,
   UEFA, Premier League).
3. **Join** — `join_bet(bet_id, side)` locks the matching stake and seals the
   duel. Opponents must choose the opposite outcome.
4. **Resolve** — anyone calls `resolve_bet(bet_id)`. The contract re-reads the
   committed URL, the LLM extracts the result, and validators confirm it.
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

## Contract reference

Contract: `contracts/p2p_gambling.py` — class `P2PGambling`.

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
| GenLayer Studio (chain `61999`) | `0xC0C1F6AdEFB3ECc794fBDF3B7224e9BE95D0ac1c` |

## Roadmap

- Additional sports (basketball, tennis, esports)
- More bet types (over/under, Asian handicap, correct score)
- Multi-game parlays
- Player leaderboards and achievements
- Appeals / dispute escalation with higher fee tiers

## License

MIT — see [LICENSE](LICENSE).
