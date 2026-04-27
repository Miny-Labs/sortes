# Sortes

> Privacy-first prediction markets on SKALE Base, settling against the public truth.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.30-363636.svg)](https://soliditylang.org/)
[![Network](https://img.shields.io/badge/network-SKALE%20Base%20Sepolia-blueviolet.svg)](https://base-sepolia-testnet-explorer.skalenodes.com/)

Sortes is an open-source prediction-market protocol where the **bet direction and amount stay encrypted on-chain until resolution**, settled trustlessly via SKALE BITE Phase 2 threshold encryption. There are no off-chain components, no trusted operators, and no privileged decryption keys held by anyone.

The name is Latin for *lots cast* — the Roman ritual of sealed prophecies opened at a fixed moment. The mechanic of the protocol is identical: bets sealed, batch-decrypted at resolution.

## Status

Pre-alpha. Building toward a functional alpha on **SKALE Base Sepolia testnet** (chain id `324705682`). Mainnet launch will be on SKALE Base.

| Checkpoint | Status |
| --- | --- |
| C1: Repo scaffold, audited dependencies vendored | done |
| C2: SealedPool contract written, tests passing, awaiting testnet deployment | in progress |
| C3: Public AMM via Polymarket CTF + Gnosis FPMM | pending |
| C4: ConfidentialCollateralWrapper for cUSDC integration | pending |
| C5: UMA Optimistic Oracle v3 cross-chain resolution | pending |
| C6: End-to-end demo on testnet | pending |

This README updates with every commit. Deployed addresses are recorded in [`deployments/`](deployments/).

### Test status

```
forge test
26 passed, 0 failed
```

- 4 sanity tests (precompile addresses, type imports)
- 22 SealedPool tests (lifecycle, oracle path, happy path, refunds, cancellation, fee cap, callback security, gas bounds)

## Architecture

Two market types share resolution against the same oracle:

1. **Public AMM** (Polymarket-on-SKALE). Forks the audited Polymarket CTF Exchange and Gnosis FixedProductMarketMaker. Bet direction is visible (it has to be, that is what moves price). Holdings can optionally be private via the `ConfidentialCollateralWrapper` over cUSDC. Provides live odds and price discovery for casual users.
2. **Sealed Pool** (the dark-pool side). New contract using BITE Phase 2. Users submit threshold-encrypted bets (outcome + amount). The contract escrows ciphertexts. At market deadline, a single batch decryption call to the SubmitCTX precompile (`0x1B`) unseals every bet atomically in `onDecrypt`, computes payouts against the oracle outcome, and settles. No front-running window. Losing bets stay encrypted forever if the market is configured that way.

Both layers settle against the same UMA Optimistic Oracle v3 outcome, bridged from Base Sepolia (where UMA lives) to SKALE Base Sepolia via the SKALE native bridge.

```
                          ┌────────────────────────────┐
                          │  Market: "ETH > $5K July?" │
                          └────────────┬───────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
       ┌────────────────┐    ┌────────────────────┐  ┌──────────────┐
       │  Public AMM    │    │   Sealed Pool      │  │  UMA OOv3     │
       │  (CTF + FPMM)  │    │  (BITE Phase 2)    │  │  (Base Sepolia)│
       │  Live odds     │    │  Encrypted bets    │  │               │
       │  Bet visible   │    │  Hidden until end  │  │  Asserts      │
       │  Balances opt. │    │  Atomic settle     │  │  outcome      │
       │  private       │    │                    │  │               │
       └────────┬───────┘    └────────┬───────────┘  └──────┬────────┘
                │                     │                     │
                └─────────────────────┼─────────────────────┘
                                      ▼
                       ┌──────────────────────────┐
                       │   USDC.e payouts on      │
                       │   SKALE Base Sepolia     │
                       └──────────────────────────┘
```

## Audited foundation

Sortes does not invent crypto and does not modify audited contracts. The novel surface is small: `SealedPool.sol`, `ConfidentialCollateralWrapper.sol`, and a `SortesOracleSink.sol` cross-chain bridge. Everything else is vendored from production-audited upstreams as git submodules in `lib/`.

| Component | Source | License | Audit |
| --- | --- | --- | --- |
| Conditional Tokens Framework | [`Polymarket/conditional-tokens-contracts`](https://github.com/Polymarket/conditional-tokens-contracts) | LGPL-3.0 | [ChainSecurity, Apr 2024](https://old.chainsecurity.com/wp-content/uploads/2024/04/ChainSecurity_Polymarket_Conditional_Tokens_audit.pdf) |
| CTF Exchange (CLOB) | [`Polymarket/ctf-exchange`](https://github.com/Polymarket/ctf-exchange) | MIT | [ChainSecurity, Nov 2022](https://reports.chainsecurity.com/Polymarket/ChainSecurity_Polymarket_Exchange_Audit.pdf) |
| FixedProductMarketMaker (CPMM) | [`gnosis/conditional-tokens-market-makers`](https://github.com/gnosis/conditional-tokens-market-makers) | LGPL-3.0 | G0 Group / Solidified, refreshed by ChainSecurity 2024 reuse audit |
| UMA CTF Adapter | [`Polymarket/uma-ctf-adapter`](https://github.com/Polymarket/uma-ctf-adapter) | MIT | OpenZeppelin |
| Confidential Token (BITE) | [`skalenetwork/confidential-token`](https://github.com/skalenetwork/confidential-token) | AGPL-3.0 | SKALE-internal |
| OpenZeppelin Contracts | [`OpenZeppelin/openzeppelin-contracts`](https://github.com/OpenZeppelin/openzeppelin-contracts) v5.4 | MIT | OpenZeppelin |

## Network and tokens

### SKALE Base Sepolia testnet

| Field | Value |
| --- | --- |
| Chain ID | `324705682` |
| RPC | `https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha` |
| Explorer | https://base-sepolia-testnet-explorer.skalenodes.com |
| Native gas token | CREDIT |
| Faucet | https://base-sepolia-faucet.skale.space |
| Bridge portal | https://base-sepolia.skalenodes.com |

### Bridged token addresses on SKALE Base Sepolia

| Token | Address | Decimals |
| --- | --- | --- |
| USDC.e | `0x2e08028E3C4c2356572E096d8EF835cD5C6030bD` | 6 |
| SKL | `0xaf2e0ff5b5f51553fdb34ce7f04a6c3201cee57b` | 18 |
| WBTC | `0x4512eacd4186b025186e1cf6cc0d89497c530e87` | 8 |
| WETH | `0xf94056bd7f6965db3757e1b145f200b7346b4fc0` | 18 |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | n/a |

### Sortes deployments

None yet. This table fills in as checkpoints land.

## Build and test

Prerequisites: [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`, `anvil`), Node 20+, Yarn, Git.

```bash
git clone --recurse-submodules https://github.com/Miny-Labs/sortes.git
cd sortes
cp .env.example .env
# Edit .env with your testnet deployer private key and any custom RPC URLs

# Install Foundry deps (already wired via .gitmodules)
forge install

# The SKALE confidential-token submodule pulls its BITE library via npm
(cd lib/confidential-token && yarn install)

forge build
forge test
```

## Deploy to SKALE Base Sepolia

After C2 contracts are written, deployment scripts under `script/` will be runnable as:

```bash
source .env
forge script script/01_DeploySealedPool.s.sol \
  --rpc-url $SKALE_BASE_SEPOLIA_RPC \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url $SKALE_BASE_SEPOLIA_VERIFIER_URL
```

## Team

- **Akash Mondal** ([@akash-mondal](https://github.com/akash-mondal)) — Miny Labs co-founder. Prior BITE v2 production builds: [Pixie](https://github.com/akash-mondal/pixie), [Twinkle](https://github.com/akash-mondal/twinkle-scale).
- **Hitakshi Arora** ([@hitakshiA](https://github.com/hitakshiA)) — CS Data Science at SRM, Data Engineering at NIC, DomainFi $10K Challenge winner.

## License

Sortes is released under [AGPL-3.0-only](LICENSE). Submodules retain their original licenses (MIT, LGPL-3.0, AGPL-3.0). The combined work distributes under AGPL-3.0.

## Acknowledgments

This project would not be feasible without the prior open-source work of:

- [SKALE Labs](https://skale.space/) for BITE Protocol and the Confidential Token primitive.
- [Polymarket](https://polymarket.com/) for productionizing the CTF Exchange and the UMA adapter, then open-sourcing them.
- [Gnosis](https://gnosis.io/) for the Conditional Tokens Framework and the FixedProductMarketMaker.
- [UMA](https://uma.xyz/) for the Optimistic Oracle.
- [OpenZeppelin](https://www.openzeppelin.com/) for the Solidity primitives most of the ecosystem stands on.

## Contact

For security issues see [SECURITY.md](SECURITY.md). For contributions see [CONTRIBUTING.md](CONTRIBUTING.md).
