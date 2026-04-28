<div align="center">

# Sortes

**Sealed-bid prediction markets, settled on chain.**

Direction stays encrypted until enough other people have bet alongside you. Aggregates publish in batches; payouts are computed and re-encrypted in a single threshold-decryption call. No off-chain operator, no privileged decryption key.

[![License](https://img.shields.io/badge/license-AGPL--3.0-6c63ff?style=flat-square)](LICENSE) &nbsp;
[![Solidity](https://img.shields.io/badge/solidity-0.8.27-1a1a1a?style=flat-square)](https://soliditylang.org/) &nbsp;
[![Network](https://img.shields.io/badge/network-SKALE%20Base%20Sepolia-6c63ff?style=flat-square)](https://base-sepolia-testnet-explorer.skalenodes.com/) &nbsp;
[![Tests](https://img.shields.io/badge/forge%20test-39%2F39-22c55e?style=flat-square)](#tests) &nbsp;
[![Live](https://img.shields.io/badge/contract-verified-22c55e?style=flat-square)](https://base-sepolia-testnet-explorer.skalenodes.com/address/0x3194DAFa48B6c0D4EB2A26961EECad50f2dA351d)

[Live demo](#) · [Frontend](frontend/) · [Contract](src/SealedPool.sol) · [Architecture](ARCHITECTURE.md) · [Integration](INTEGRATION.md)

</div>

---

## What it is

A prediction-market protocol where a single bet never moves the order book. Bettors submit threshold-encrypted picks; the protocol unseals them in batches of two or more, so observers see the aggregate change but cannot attribute it to any one trader. At resolution, payouts are computed and re-encrypted under each winner's viewer key in a single batch decryption.

Bet **direction** is private by default. **Stake amount** is private when the market is paired with the confidential ERC-20 wrapper (`cnfUSDC.e`).

The name is Latin for *lots cast* — sealed prophecies opened at a fixed moment.

## How it works

```
                  ┌─────────────────────────────────────────────┐
                  │  "Will BTC close above $150k on July 4?"    │
                  └────────────────────┬────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
 ┌──────────────┐              ┌──────────────┐              ┌──────────────┐
 │ submitSealed │              │  submitConf  │              │   Oracle     │
 │   BetWith    │              │ identialBet  │              │ (admin or    │
 │  Encryption  │              │              │              │  UMA OOv3)   │
 │              │              │ direction +  │              │              │
 │ direction    │              │   amount     │              │  reports     │
 │ encrypted    │              │ encrypted    │              │  outcome     │
 │ stake clear  │              │ via cnfUSDC  │              │              │
 └──────┬───────┘              └──────┬───────┘              └──────┬───────┘
        │                             │                             │
        └──────────────┬──────────────┘─────────────────────────────┘
                       ▼
        ┌─────────────────────────────────────────┐
        │ Phase 2 SubmitCTX  (precompile 0x1B)    │
        │   Batch decrypt every sealed bet         │
        │   onDecrypt computes payouts             │
        │ Phase 3 EncryptECIES  (precompile 0x1C)  │
        │   Re-encrypt each payout under viewer    │
        │   key. Plaintext lives only in stack.    │
        └────────────────────┬────────────────────┘
                             ▼
            ┌────────────────────────────────┐
            │  redeem  /  redeemConfidential │
            │  USDC.e or cnfUSDC.e payout    │
            └────────────────────────────────┘
```

- **Direction privacy**: every bet is TE-encrypted (Phase 2 precompile `0x1D`) and ECIES-encrypted (Phase 3 precompile `0x1C`) inside the contract itself, so the ciphertext's AAD is bound to the pool address and can't be reused elsewhere.
- **Aggregate disclosure**: the public order book updates only after at least two new bets accumulate. A single trade never reveals which side it took.
- **Unified TVL**: public bets in `USDC.e` and confidential bets in `cnfUSDC.e` share one pot. At redeem time the pool wraps or unwraps as needed so a public-side winner can be paid out partly from confidential collateral and vice versa, without breaking the privacy of the latter.
- **Re-encrypted payouts**: winners' payout amounts never appear in clear after `onDecrypt` returns. Each winner decrypts their own claim client-side with their viewer private key.

## Live deployment

Verified on SKALE Base Sepolia (chain id `324705682`). The contract address below is the canonical one — earlier deployments are recorded as deprecated in [`deployments/skale-base-sepolia.json`](deployments/skale-base-sepolia.json).

| | Address | |
| --- | --- | --- |
| **SealedPool v4** | [`0x3194DAFa48B6c0D4EB2A26961EECad50f2dA351d`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0x3194DAFa48B6c0D4EB2A26961EECad50f2dA351d) | unified-TVL pool with `submitConfidentialBet` and cross-pot wrap/unwrap on redeem |
| **ConfidentialWrapper** | [`0xEbf27A9A2C38308209F912329Da4b6bFe78DB8fb`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0xEbf27A9A2C38308209F912329Da4b6bFe78DB8fb) | `cnfUSDC.e` — encrypted-balance ERC-20 over the bridged USDC.e |
| USDC.e (bridged) | [`0x2e08028E3C4c2356572E096d8EF835cD5C6030bD`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0x2e08028E3C4c2356572E096d8EF835cD5C6030bD) | public-side collateral |
| AccessManager | [`0x0556EE147C56627565Bf681eDeC27aE92275A905`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0x0556EE147C56627565Bf681eDeC27aE92275A905) | OZ access control for the wrapper |
| PrecompileSmoke | [`0xBfa3d8958BC4dd6Ad171556B09d623040b98E8a0`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0xBfa3d8958BC4dd6Ad171556B09d623040b98E8a0) | direct BITE precompile probe |

10 markets are open at the time of writing (BTC > $150k on July 4, Fed cut at June 17 FOMC, Anthropic IPO terms by Sept 30, spot SOL ETF, ETH > $8k by Oct, Celtics 2026, GPT-6 ship, Polymarket $5B volume, Apple foldable, Tesla Q2 deliveries). Four of them have `cnfUSDC.e` enabled for full amount privacy.

## End-to-end proof on chain

Every contract path is exercised against real BITE precompiles, no mocks.

| Step | Tx |
| --- | --- |
| Create market | [`0x9689b1…c0f97`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x9689b18dd3c23e6d0a3f62760b5011db1feb544587ededbeeed64225e04c0f97) |
| Submit sealed bet (inline Phase 3 encryption) | [`0x140af0…1fe74`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x140af0c5052f105add9a3687dc37c19a897bd5a9e0e898d2cde3c86c3c61fe74) |
| Set oracle outcome | [`0x8d2115…a5867`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x8d2115ec25e03e8f9fbf53de09114f2525f16bdbf6c56fbc563b05d1174a5867) |
| Trigger resolution (Phase 2 SubmitCTX) | [`0xb6e5e1…b5002`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xb6e5e1932f873f2e1930a1e9ddb928d69d3e143992e6628a855ec6797ffb5002) |
| Redeem (Phase 3 ECIES payout) | [`0xc91179…dcbebf`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xc911790d63c536b0588321b2df956d87461a88d8989a4fc2d1dce44493dcbebf) |
| 1 USDC.e in → 0.99 USDC.e out (1% protocol fee) | settled |

The two precompiles the protocol depends on are independently verified live:

| Precompile | Address | Verification | Result |
| --- | --- | --- | --- |
| EncryptTE | `0x000…001D` | [`0x517899…41325`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x5178992c8e0351fa977a2766fe2ebb9002abbd070b50886b9aff961a57e41325) | 324-byte ciphertext · 265k gas |
| EncryptECIES | `0x000…001C` | [`0x30c935…d5f11`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x30c93529ec9b3c2a040091972490ad921cd257088722a1f4bfdf37191d6d5f11) | 97-byte ciphertext · 125k gas |

Two findings the SKALE skill docs don't make obvious:

1. **`evm_version` matters.** Bytecode compiled with `cancun` cannot invoke the BITE precompiles on this chain. Use `istanbul`.
2. **`EncryptECIES` validates the curve.** Pass a real secp256k1 public key — arbitrary `(x, y)` pairs OOG.

## Repository layout

```
sortes/
├── src/
│   ├── SealedPool.sol            # the pool — Phase 2 + Phase 3, unified TVL
│   ├── interfaces/
│   │   ├── ISortesSealedPool.sol
│   │   └── IResolutionOracle.sol
│   └── oracle/
│       └── UmaOracleSink.sol     # cross-chain UMA adapter (UMA OOv3 stub)
├── test/
│   ├── SealedPool.t.sol          # 35+ unit tests
│   └── mocks/
│       ├── MockUSDC.sol
│       ├── MockConfidentialToken.sol
│       └── IdentityCTX.sol
├── script/
│   ├── 01_DeploySealedPool.s.sol
│   └── 02_PrecompileSmoke.s.sol
├── frontend/                     # Next.js 15 + Tailwind + Wagmi
│   ├── app/                      # `/`, `/admin`, `/api/faucet`
│   ├── components/               # MarketCard, drawers, BetForm, QuickStart …
│   └── lib/                      # chain config, wagmi config, ABIs
├── sdk/                          # TypeScript SDK (ethers-based)
│   ├── sortes.ts                 # `SortesClient`
│   ├── ecies.ts                  # client-side decrypt helpers
│   └── …
├── abi/
│   ├── SealedPool.json
│   └── UmaOracleSink.json
├── deployments/
│   └── skale-base-sepolia.json
├── lib/                          # vendored audited dependencies
│   ├── bite-solidity/            # SKALE bite-solidity@1.0.1-stable.0
│   ├── confidential-token/       # SKALE confidential-token
│   └── openzeppelin-contracts/   # pinned to v5.4.0 (mcopy avoidance)
└── examples/
    └── place-public-bet.ts
```

## Vendored audited dependencies

Sortes does not invent crypto and does not modify audited contracts. The novel surface is small (~1,320 lines): `SealedPool.sol` and `UmaOracleSink.sol`. Everything else is vendored:

| Component | Source | Pinned | Audit |
| --- | --- | --- | --- |
| OpenZeppelin Contracts | [`OpenZeppelin/openzeppelin-contracts`](https://github.com/OpenZeppelin/openzeppelin-contracts) | v5.4.0 | OpenZeppelin |
| BITE Solidity (SKALE) | [`skalenetwork/bite-solidity`](https://github.com/skalenetwork/bite-solidity) | `1.0.1-stable.0` | SKALE-internal |
| Confidential Token (SKALE) | [`skalenetwork/confidential-token`](https://github.com/skalenetwork/confidential-token) | `0.0.1-develop.29` | SKALE-internal |

That's the full third-party surface that ends up in the build. Sortes uses five OpenZeppelin primitives (`Ownable`, `ReentrancyGuard`, `IERC20`, `SafeERC20`, `Address`), the BITE precompile wrappers + `IBiteSupplicant` callback interface, and talks to a deployed-unmodified `ConfidentialWrapper` via interface for the private bet path. The bet pool, settlement math, cross-pot solvency, callback routing, oracle adapter, viewer-key handling, and fee sweep are all in `SealedPool.sol` — fully novel and not externally audited (covered by 39 forge tests + a live end-to-end run on chain).

## Frontend

`frontend/` is a single-page Next.js 15 app. Two routes only — `/` for everything and `/admin` for operator-only market creation. Everything else is a drawer.

```bash
cd frontend
npm install

# .env.local
#   FAUCET_PRIVATE_KEY=0x…                  (server-only, drips 5 USDC.e)
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=…  (optional)

npm run dev   # localhost:3000
```

Highlights:

- **Browse without connecting.** Markets, odds, and contract refs render without a wallet. Connecting is only needed to sign a bet, claim from the faucet, or wrap.
- **Built-in faucet.** `POST /api/faucet { address }` drips 5 USDC.e per address per 24h from a server-side `FAUCET_PRIVATE_KEY`.
- **Inline `cnfUSDC.e` wrap.** Wallet drawer's wrap card calls `approve` + `depositFor` against the ConfidentialWrapper.
- **Sealed and private bet paths.** The bet form's mode toggle picks `submitSealedBetWithEncryption` (direction private) or `submitConfidentialBet` (direction + amount private).
- **First-bet onboarding.** A QuickStart row under the wordmark walks new users through Connect → Claim faucet → Place a private bet, then auto-dismisses.

## SDK

```ts
import { SortesClient, generateViewerKeyPair } from "@sortes/sdk";

const viewer = generateViewerKeyPair();
const client = new SortesClient({
  rpc: "https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha",
  pool: "0x3194DAFa48B6c0D4EB2A26961EECad50f2dA351d",
  signer,
});

const tx = await client.submitSealedBet({
  marketId: 2n,
  outcome: 1,                 // YES
  stake: 5_000_000n,          // 5 USDC.e (6 decimals)
  viewerKey: viewer.publicKey,
});
```

A runnable end-to-end example lives at [`examples/place-public-bet.ts`](examples/place-public-bet.ts).

## Build & test

Prerequisites: [Foundry](https://book.getfoundry.sh/), Node 20+, Yarn, Git.

```bash
git clone --recurse-submodules https://github.com/Miny-Labs/sortes.git
cd sortes
cp .env.example .env

forge install
(cd lib/confidential-token && yarn install)

forge build
forge test          # 39 / 39
```

## Deploy

```bash
source .env

# Contract
forge create src/SealedPool.sol:SealedPool \
  --rpc-url $SKALE_BASE_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --legacy --value 0.001ether \
  --constructor-args $DEPLOYER $TREASURY 100000000000000

# Verify
forge verify-contract <address> src/SealedPool.sol:SealedPool \
  --rpc-url $SKALE_BASE_SEPOLIA_RPC \
  --verifier blockscout \
  --verifier-url $SKALE_BASE_SEPOLIA_VERIFIER_URL

# Frontend (Vercel)
cd frontend && vercel deploy
```

## Roadmap

| | Status |
| --- | --- |
| Sealed bet path with inline Phase 3 encryption | live |
| Aggregate disclosure (N≥2 reveal threshold) | live |
| Confidential bet path (`submitConfidentialBet` + `cnfUSDC.e`) | live |
| Cross-pot wrap/unwrap for unified-TVL solvency | live |
| Pluggable oracle adapter (`setMarketOracleAdapter`) | live |
| Pre-funded test faucet + first-bet onboarding | live |
| UMA Optimistic Oracle v3 cross-chain resolution | next |
| Encrypted track record + selective reveal | next |
| SKALE mainnet launch (after confidential-token audit clears) | post-mvp |

## Team

- **Akash Mondal** ([@akash-mondal](https://github.com/akash-mondal)) — Miny Labs co-founder. Prior BITE v2 production builds: [Pixie](https://github.com/akash-mondal/pixie), [Twinkle](https://github.com/akash-mondal/twinkle-scale).
- **Hitakshi Arora** ([@hitakshiA](https://github.com/hitakshiA)) — CS Data Science at SRM, Data Engineering at NIC, DomainFi $10K Challenge winner.

## Acknowledgments

Sortes stands on:

- [SKALE Labs](https://skale.space/) for BITE Protocol and the Confidential Token primitive.
- [UMA](https://uma.xyz/) for the Optimistic Oracle (target for cross-chain resolution).
- [OpenZeppelin](https://www.openzeppelin.com/) for the Solidity primitives most of the ecosystem stands on.

## License

[AGPL-3.0-only](LICENSE). Submodules retain their original licenses (MIT, LGPL-3.0, AGPL-3.0); the combined work distributes under AGPL-3.0.

Security disclosure: [SECURITY.md](SECURITY.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).
