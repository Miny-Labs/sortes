# Sortes frontend

Single-page Next.js 15 app for Sortes — sealed prediction markets on SKALE Base
Sepolia. Built around the `taste-skill` design discipline (Geist, Zinc + one
signal accent, asymmetric layout, spring physics, no AI tells).

## Setup

```bash
cd frontend
npm install

# .env.local — required for the faucet button to work:
#   FAUCET_PRIVATE_KEY=0x...        (server-only, drips 5 USDC.e on demand)
# .env.local — optional:
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<id from cloud.walletconnect.com>

npm run dev
```

Open http://localhost:3000.

## Routes

Two pages on purpose. Everything else is drawers.

- `/` — hero, markets bento, contract refs. Clicking a market opens a right-side
  drawer with the full detail and bet form. Wallet button in the top bar opens
  a wallet drawer with balances, faucet, USDC.e → cnfUSDC.e wrap, and your bets.
- `/admin` — owner-only market creation. The contract enforces ownership so
  this is just a thin form.

## Browse without connecting

Markets, odds, and contract references render without a wallet. Connecting is
only required to sign a sealed bet, claim from the faucet, or wrap to cnfUSDC.

## Faucet

`POST /api/faucet { address }` drips 5 USDC.e from `FAUCET_PRIVATE_KEY` to the
caller. Naive in-memory rate limit: one claim per address per 24h. Restart the
process to clear it. Don't deploy this to a multi-tenant production environment
without persistent rate limiting.

## Wrap (USDC.e → cnfUSDC.e)

Available in the wallet drawer. Approves the wrapper once, then `depositFor`s
the chosen amount of bridged USDC.e into the SKALE confidential ERC-20 at
`0xEbf27A9A2C38308209F912329Da4b6bFe78DB8fb`. Encrypted balances surface as
"encrypted" in the UI; decrypt is a client-side operation against the SDK's
`ecies` helpers.

## Architecture

- `app/page.tsx` — hero + bento + drawers state.
- `app/admin/page.tsx` — operator-only market creation.
- `app/api/faucet/route.ts` — Node runtime route, signs locally.
- `components/TopBar.tsx` — sticky header, faucet pill, wallet trigger.
- `components/MarketDrawer.tsx` — slide-in market detail + bet form.
- `components/WalletDrawer.tsx` — balances, faucet, wrap, bets tab.
- `components/BetForm.tsx` — sealed bet path with magnetic CTA.
- `components/MarketCard.tsx` — spotlight-border card.
- `components/OddsBreakdown.tsx` — refined data viz with reveal trigger.
- `lib/chain.ts` — chain definition shared between server and client.
- `lib/wagmi.ts` — Wagmi config (client only).
- `lib/contracts.ts` — addresses + ABIs (SealedPool, ERC20, cnfUSDC).
- `lib/markets.ts` — read hooks (`useAllMarkets`, `useMarket`, aggregates).
- `lib/faucet.ts` — `useFaucet` client hook.

## Bet paths (current contract — v4)

The deployed `v4-confidentialBet` SealedPool exposes both:

- `submitSealedBetWithEncryption` — sealed direction in USDC.e collateral.
- `submitConfidentialBet` — sealed direction AND sealed stake amount in cnfUSDC.e
  collateral. Owner enables this per market via `setMarketConfidentialCollateral`.
  Cross-pot wrap/unwrap inside redeem keeps unified-TVL solvency without parallel
  pre-funded reserves.

The bet form's mode toggle picks between them. Confidential mode requires the
caller to hold cnfUSDC.e (wrap from the wallet drawer) and a registered viewer
key on the cnfUSDC.e contract — first-time users will see the contract revert
asking them to register; do that once on cnfUSDC.e directly via the wallet
drawer's wrap card.

## Deploy

```bash
npm run build
npx vercel deploy
```

Set on Vercel:

- `FAUCET_PRIVATE_KEY` — server-side only, never `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — for non-injected wallets.
