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
| C2 v0: SealedPool basic deployment (deprecated by v2 below) | done |
| C2.5: Foundry config + bite-solidity@1.0.1-stable.0 + via_ir + correct fees | done |
| C2.6: SealedPool v2 with confidential-poker patterns + Phase 2 (CTX) + Phase 3 (ECIES payout re-encryption inside onDecrypt) | done, deployed, verified |
| C2.7: cUSDC integration via skalenetwork/confidential-token | next |
| C3: Aggregate disclosure mechanism for live odds | pending |
| C4: Encrypted track record + selective reveal | pending |
| C5: UMA Optimistic Oracle v3 cross-chain resolution | pending |
| C6: End-to-end testnet demo | pending |
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
30 passed, 0 failed
```

- 4 sanity tests (precompile addresses, type imports)
- 26 SealedPool v2 tests covering: constructor reserve invariants, lifecycle, oracle path, dual-encryption submission, viewer key storage, the full happy path with **Phase 3 ECIES payout re-encryption** verified, no-winners refund, cancellation, fee cap, callback security, max-bets cap, withdraw-excess-reserve invariant.

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

#### SKALE Base Sepolia testnet

| Contract | Address | Verified | Notes |
| --- | --- | --- | --- |
| **SealedPool v2 (istanbul)** | [`0xa287C8579D04c480cCCCa02cf240F00aFb16F44E`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0xa287C8579D04c480cCCCa02cf240F00aFb16F44E) | yes | Production. Compiled per skill recommendation: evm_version=istanbul, solc 0.8.27. |
| SealedPool v2 (cancun, deprecated) | [`0xe48867fdBb61A579b01ae6F7F4DdA6bC87Fba751`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0xe48867fdBb61A579b01ae6F7F4DdA6bC87Fba751) | yes | Cancun bytecode is incompatible with BITE precompiles. Replaced. |
| SealedPool v0 (deprecated) | [`0x661329cCAAa3febb3404Bf0a2D98547E6A836b6e`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0x661329cCAAa3febb3404Bf0a2D98547E6A836b6e) | yes | Initial scaffold with wrong callback fee. Replaced. |
| PrecompileSmoke (diagnostic) | [`0xBfa3d8958BC4dd6Ad171556B09d623040b98E8a0`](https://base-sepolia-testnet-explorer.skalenodes.com/address/0xBfa3d8958BC4dd6Ad171556B09d623040b98E8a0) | no | Probes 0x1C and 0x1D via the BITE library helper. Used to verify Phase 3 precompiles are live. |

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
