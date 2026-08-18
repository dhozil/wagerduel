# WagerDuel

Next.js frontend for **WagerDuel** — a peer-to-peer football betting arena on
GenLayer. Head-to-head bets with real escrow, resolved by AI-verified real-world
data. Double or nothing.

## Setup

1. Install dependencies:

**Using bun:**
```bash
bun install
```

**Using npm:**
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` - WagerDuel contract address (GenLayer Studio)
   - `NEXT_PUBLIC_GENLAYER_RPC_URL` - Studio RPC (default: https://studio.genlayer.com/api)
   - `NEXT_PUBLIC_GENLAYER_CHAIN_ID` - Studio chain id (61999)

## Development

**Using bun:**
```bash
bun dev
```

**Using npm:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

**Using bun:**
```bash
bun run build
bun start
```

**Using npm:**
```bash
npm run build
npm start
```

## Tech Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling with custom glass-morphism theme
- **genlayer-js** - GenLayer blockchain SDK
- **TanStack Query (React Query)** - Data fetching and caching
- **Radix UI** - Accessible component primitives
- **shadcn/ui** - Pre-built UI components

## Wallet Connection

The app connects through any **EVM-compatible injected wallet** (EIP-1193
`window.ethereum` provider): MetaMask, Rabby, Coinbase Wallet, Trust, etc.

- **Connect**: requests accounts via `eth_requestAccounts`, then adds/switches
  the wallet to the GenLayer network (`wallet_addEthereumChain` /
  `wallet_switchEthereumChain`) when needed.
- **Transact**: transaction signing happens inside the user's wallet.
- **Switch Account / Disconnect**: managed through the wallet's account picker.

> For the most reliable GenLayer transaction experience, use **Rabby** or
> **MetaMask with the GenLayer Snap**. See
> [GenLayer wallet docs](https://docs.genlayer.com/) for details.

## Features

- **Create Bets**: Pick a match, choose your side (Team 1, Team 2, or Draw), and lock your stake in escrow
- **Join Bets**: Challenge the creator by matching their stake on the opposite outcome
- **Resolve Bets**: Anyone can trigger resolution — GenLayer's AI fetches and verifies the real result, then pays the winner the entire pot
- **Cancel Bets**: Creators can withdraw their stake before an opponent joins
- **Market Overview**: Live total escrow and market activity stats
- **Glass-morphism UI**: Premium dark theme with OKLCH colors, backdrop blur effects, and smooth animations
- **Real-time Updates**: Automatic data fetching with TanStack Query
