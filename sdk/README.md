# Sortes SDK

TypeScript SDK for Sortes — privacy-first prediction markets on SKALE.

## Install

```bash
npm i @sortes/sdk ethers
```

(or use the local source from this repo: `import { SortesClient } from "../sdk"`)

## Quick start

```ts
import { JsonRpcProvider, Wallet, parseUnits } from "ethers";
import { CHAIN, SortesClient } from "@sortes/sdk";

const provider = new JsonRpcProvider(CHAIN.rpcUrl);
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
const sortes = new SortesClient(signer);

// Generate a viewer keypair. PERSIST THE PRIVATE KEY OFF CHAIN.
const viewer = SortesClient.newViewerKey();

// Approve USDC.e once.
await sortes.approveUsdcMax();

// Submit a public bet on outcome=1 with 10 USDC.e stake.
const tx = await sortes.submitPublicBet({
  marketId: 1n,
  plaintextOutcome: 1n,
  viewerKey: viewer.pubKey,
  stake: parseUnits("10", 6),
});
await tx.wait();

// Later, after the market resolves, decrypt your payout claim.
const cipher = await sortes.encryptedPayoutOf(1n, 0n);
const payoutWei = SortesClient.decryptPayout(cipher, viewer.privateKey);
console.log("Payout:", payoutWei);

// Redeem.
const redeemTx = await sortes.redeem(1n, 0n);
await redeemTx.wait();
```

## What the SDK provides

- **`SortesClient`** — wraps the `SealedPool` + `cUSDC` contracts with typed
  helpers. Reads (marketInfo, statusOf, encryptedPayoutOf,
  aggregatePerOutcome, etc.) and writes (submitPublicBet,
  triggerAggregateReveal, redeem, submitConfidentialBet, redeemConfidential).
- **`ecies` module** — `generateViewerKeyPair`, `eciesEncrypt`,
  `eciesDecrypt`, `decryptPayoutAmount`. Pure secp256k1 + AES-256-CBC,
  matches SKALE BITE's EncryptECIES precompile output format.
- **`addresses` module** — chain config, deployed contract addresses,
  canonical BITE precompile addresses.
- **`types` module** — TypeScript types for `MarketStatus`, `BetInfo`,
  `MarketInfo`, `PublicKey`, `ViewerKeyPair`.

## Confidential bets (cUSDC path)

Confidential bets require the bettor to:

1. Hold cUSDC (`ConfidentialWrapper`-wrapped USDC.e).
2. Approve the SealedPool to spend cUSDC (allowance is plaintext, but
   approve a high amount once to avoid leaking actual stake size).
3. Encrypt the outcome AND stake client-side via SKALE bite-ts +
   our `eciesEncrypt`.
4. Call `submitConfidentialBet` with all four ciphertexts.

See `examples/` and `INTEGRATION.md` in the repo root for the full flow.

## Reference

- Repo: https://github.com/Miny-Labs/sortes
- Architecture: `ARCHITECTURE.md` in repo root
- Integration guide: `INTEGRATION.md` in repo root
- Contract source: `src/SealedPool.sol`
