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
| C2: SealedPool with Phase 2 + Phase 3 deployed and source-verified | done |
| C2.5: Skill-aligned foundry config (istanbul + solc 0.8.27 + bite-solidity 1.0.1-stable.0) | done |
| C2.6: confidential-poker pattern refactor (dual encryption + CTX reserve + callback routing) | done |
| C2.7: Inline Phase 3 encryption inside SealedPool (AAD-aligned with CTX submitter) | done |
| C2.8: **Live end-to-end E2E on chain — sealed bet → resolution → encrypted payout → redeem** | done |
| C3: Aggregate disclosure for live odds | pending |
| C4: Encrypted track record + selective reveal | pending |
| C5: UMA Optimistic Oracle v3 cross-chain resolution | pending |
| C6: End-to-end demo script | done (`scripts/e2e-demo.sh`) |
| C7: Private beta launch with SKALE Labs GTM | pending |
| C8: Mainnet launch on SKALE Base when Confidential Token audit clears | pending |

This README updates with every commit. Deployed addresses are recorded in [`deployments/`](deployments/).

#### BITE precompile live verification on SKALE Base Sepolia

Both Phase 3 precompiles (and by extension Phase 2 SubmitCTX, all from the same family) are verified live as of 2026-04-28.

| Precompile | Address | Verification tx | Result |
| --- | --- | --- | --- |
| EncryptTE | `0x000...001D` | [`0x517899...e41325`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x5178992c8e0351fa977a2766fe2ebb9002abbd070b50886b9aff961a57e41325) | success, 324-byte ciphertext, 265k gas |
| EncryptECIES | `0x000...001C` | [`0x30c935...d6d5f11`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x30c93529ec9b3c2a040091972490ad921cd257088722a1f4bfdf37191d6d5f11) | success, 97-byte ciphertext, 125k gas |

Both calls were issued by the [`PrecompileSmoke`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0xBfa3d8958BC4dd6Ad171556B09d623040b98E8a0) wrapper using the official `bite-solidity@1.0.1-stable.0` library helpers `BITE.encryptTE` and `BITE.encryptECIES`.

**Two diagnostic findings** that are easy to miss:
1. **The compiler EVM target matters.** Bytecode compiled with `evm_version = "cancun"` cannot successfully call the BITE precompiles on SKALE Base Sepolia. Switching to `"istanbul"` (the value the `programmable-privacy` skill explicitly recommends) fixes it.
2. **EncryptECIES validates the public key is on the secp256k1 curve.** Passing arbitrary `(x, y)` bytes32 pairs causes the call to OOG. The viewer key must be a real secp256k1 public key.

### Test status

```
forge test
37 passed, 0 failed
```

### Frontend integration

ABIs are exported under [`abi/`](abi/). Step-by-step integration guide for both public and confidential bet flows: [`INTEGRATION.md`](INTEGRATION.md). Architecture rationale and design decisions: [`ARCHITECTURE.md`](ARCHITECTURE.md).

- 4 sanity tests (precompile addresses, type imports)
- 33 SealedPool tests covering: constructor reserve invariants, lifecycle, oracle path, dual-encryption submission, viewer key storage, the full happy path with **Phase 3 ECIES payout re-encryption** verified, no-winners refund, cancellation, fee cap, callback security, max-bets cap, withdraw-excess-reserve invariant, **aggregate disclosure** (N≥2 threshold, multiple incremental reveals, market-state guards), **pluggable oracle adapter** (delegated reporting, unauthorized rejection, owner override).

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

#### SKALE Base Sepolia testnet — production deployment

| Contract | Address | Verified | Notes |
| --- | --- | --- | --- |
| **SealedPool v3** | [`0x04DFB8B3A9ed4017151f5f1a4427eD51cF02C589`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0x04DFB8B3A9ed4017151f5f1a4427eD51cF02C589) | yes | Unified-TVL design with public + confidential bet paths sharing one pot. |
| SealedPool v2 (E2E proof) | [`0x05aD32257EE764721D9f97BDD1520ed1146701E3`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0x05aD32257EE764721D9f97BDD1520ed1146701E3) | yes | Live E2E demo deployment (public-only). |
| PrecompileSmoke (diagnostic) | [`0xBfa3d8958BC4dd6Ad171556B09d623040b98E8a0`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0xBfa3d8958BC4dd6Ad171556B09d623040b98E8a0) | yes | BITE precompile probes. |

Earlier deployments (v0, v2-cancun, v2-istanbul without inline encryption) are recorded as deprecated in [`deployments/skale-base-sepolia.json`](deployments/skale-base-sepolia.json).

#### Live end-to-end proof on chain

A full lifecycle ran on SKALE Base Sepolia using real BITE Phase 2 + Phase 3 precompiles, no mocks. Bet 1 USDC.e, oracle resolved correctly, payout 0.99 USDC.e returned (1.0 minus 1% protocol fee).

| Step | Tx |
| --- | --- |
| Create market | [`0x9dc47cae...3625aef`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x9dc47cae2f36f4033a3203bf510bd6c59718d5aaf675e0be100b6d3f43625aef) |
| Submit sealed bet (inline Phase 3 encryption) | [`0x4776627e...c1f972f73`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x4776627e685a297a82a5ece27d81ca475a7d8d132fda8804e849313c1f972f73) |
| Set oracle outcome | [`0x19b88f9a...c4ff4a1`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x19b88f9a825ad08f0244fd268e7ae2918d6cc9a6292c819af81f4b7e0c4ff4a1) |
| Trigger resolution (Phase 2 SubmitCTX) | [`0x3062e7d5...002e51dc`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x3062e7d53d094d36b7e97e68e17c4bb779966d3d7fd3d8091c1e6992002e51dc) |
| Redeem (Phase 3 ECIES-encrypted payout) | [`0x9a21ee61...ccdb95e`](https://base-sepolia-testnet-explorer.skalenodes.com/tx/0x9a21ee61ba468922f64db8caf81568562afa19378fdf7abd4196d6715ccdb95e) |

**SealedPool v2 (istanbul)** is the production contract. Configured with:
- `submitCtxAddress = 0x...1B` (canonical Phase 2 SubmitCTX precompile)
- `encryptEciesAddress = 0x...1C` (canonical Phase 3 EncryptECIES precompile)
- `encryptTeAddress = 0x...1D` (canonical Phase 3 EncryptTE precompile)
- `ctxCallbackValueWei = 0.002 CREDIT` (testnet; mainnet target 0.06 ETH per SKALE recommendation)
- `MIN_CTX_RESERVE_CALLBACKS = 10`, `CTX_GAS_LIMIT = 2_500_000`, `protocolFeeBps = 100`, `MAX_BETS_PER_MARKET = 200`

Phase integration:
- **Phase 2 (CTX)**: `triggerResolution` calls `BITE.submitCTX(0x1B, ...)` to batch-decrypt all sealed bets in the next block.
- **Phase 3 (Re-encryption)**: inside `onDecrypt`, the contract calls `BITE.encryptECIES(0x1C, payoutAmount, viewerKey)` for each winner, storing only the encrypted payout claim. The winner decrypts off chain with their viewer private key.
- TE encryption (`0x1D`) is performed **client-side via bite-ts** before submission; the contract never calls `encryptTE`.

Full record in [`deployments/skale-base-sepolia.json`](deployments/skale-base-sepolia.json).

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
