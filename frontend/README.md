# Sortes frontend

Next.js 15 + Tailwind + Wagmi/RainbowKit frontend for Sortes prediction markets.

## Setup

```bash
cd frontend
npm install
# (optional) create .env.local with:
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your project id from cloud.walletconnect.com>
npm run dev
```

Open http://localhost:3000.

## Pages

- `/` — markets list (live odds via aggregate disclosure)
- `/markets/[id]` — market detail + bet placement
- `/portfolio` — your positions across all markets, redeem flow
- `/admin` — owner-only market creation

## What it does end-to-end

1. **Connect wallet** (RainbowKit, supports MetaMask/Rainbow/WalletConnect).
2. **Browse open markets** with live aggregate odds. The N≥2 anti-deanonymization threshold is exposed via a "Trigger reveal" button when 2+ new bets are pending.
3. **Place a sealed bet**: select outcome, set stake, generate viewer key (saved in `localStorage`), approve USDC.e once, submit. Pool encrypts inline via Phase 3.
4. **Confidential mode toggle**: alpha — wires up to `submitConfidentialBet` once cnfUSDC.e wrapping is in the UI. The contract supports it today.
5. **Portfolio**: see your bets, redeem winners after resolution.
6. **Admin**: create new markets (owner only).

## Architecture notes

- All chain reads use Wagmi's `useReadContract` / `useReadContracts` for caching.
- Writes go through `useWriteContract`.
- The SealedPool ABI is imported from `../abi/SealedPool.json` (the one this repo's contracts export).
- Viewer keys are generated client-side using `@noble/curves/secp256k1` and persisted in `localStorage` keyed by `(wallet, marketId)`. Users can export their keys later for cross-device decrypt.
- ECIES decryption of payout claims uses the same noble libs (mirroring the SDK's `ecies.ts`).

## Dev TODO (for the frontend team)

- Wire confidential bet flow: cnfUSDC.e wrap + balance display + `submitConfidentialBet` call with bite-ts client-side encryption.
- Add charts: oracle outcome history per market, Brier-score reputation graphs.
- Add a "decrypt my payout" button on resolved bets, reading `encryptedPayoutOf` and decrypting with the saved viewer key.
- WalletConnect Cloud Project ID setup: register at https://cloud.walletconnect.com and put the id in `.env.local`.
- Polish: skeleton loaders, optimistic updates, error toasts.
- Mobile breakpoints: Tailwind utilities are in place but no real mobile testing yet.
- Markets-list filtering, search, sorting.
- Notification system for resolution events (subscribe to `MarketResolved` and `ResolutionTriggered`).

## Deploy

Vercel:
```bash
cd frontend
npx vercel deploy
```

Or any static-friendly host. The app uses RSC + client components — Vercel's Next.js runtime is the cleanest fit. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in the Vercel env config.

## Repo layout

```
frontend/
├── app/             # Next.js app router
│   ├── layout.tsx   # global header + footer
│   ├── providers.tsx
│   ├── page.tsx     # markets list
│   ├── markets/[id]/page.tsx
│   ├── portfolio/page.tsx
│   └── admin/page.tsx
├── components/
│   ├── MarketCard.tsx
│   ├── BetForm.tsx
│   └── OddsBreakdown.tsx
├── lib/
│   ├── wagmi.ts        # SKALE Base Sepolia chain config
│   ├── contracts.ts    # ABI + addresses
│   └── markets.ts      # data hooks
├── package.json
└── tailwind.config.ts
```
