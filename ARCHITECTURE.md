# Sortes Architecture

This is the design rationale for the Sortes prediction market protocol. It exists to give auditors, frontend devs, and integrators a complete picture of WHY each piece exists, not just WHAT it does.

For setup and integration calls see [INTEGRATION.md](INTEGRATION.md).
For the deployed addresses see [README.md](README.md).

## Goal

Build the first prediction market that gives users **a real privacy choice**:
- A familiar Polymarket-shape UX (live odds, fast bets, composable USDC.e collateral) where individual bet directions are encrypted but everything else is visible.
- A true dark-pool option (encrypted bet amount AND direction, cUSDC settlement) for whales, insiders, and anyone with skin in the game who can't afford to be doxxed.

Same contract. Same oracle. Same pot. Bettor picks per bet.

## The unified-TVL design

The core architectural decision: **public bets and confidential bets share one pot**, not two.

### Why this matters

A naive design ("two separate pools") would split TVL: a confidential whale ends up isolated in a small confidential pool with no opposing bets to lose to. The whale's payout multiplier collapses because there's nothing to win against. This kills the use case.

The unified-TVL design:

```
Market: "Will X happen?"
├── bets[]               (public side: plaintext stake, encrypted direction)
└── confidentialBets[]   (confidential side: encrypted stake AND direction)

ONE pot at resolution:
  totalStake = publicTotalStake + confidentialTotalStake
  totalWinningStake = publicWinning + confidentialWinning
  payout(bet) = bet.stake * (totalStake - fee) / totalWinningStake
```

A whale's confidential 100 cUSDC stake gets matched against losing bets from BOTH the public USDC.e side AND the confidential cUSDC side. The pot is unified. Liquidity is shared.

### Implementation

`SealedPool.triggerResolution` builds a single CTX whose encrypted-arg array contains:
- one entry per public bet (encrypted direction)
- two entries per confidential bet (encrypted direction + encrypted stake)

`plaintextArguments[i]` carries a tag `(uint8 typ, uint256 marketId, uint256 betIdx)` that tells `_settleResolution` how to interpret each decrypted value. After the loop:

```
publicWinningStake     = sum(bet.stake where chosen == oracleOutcome) over public bets
confidentialTotalStake = sum(decrypted stake) over confidential bets
confidentialWinning    = sum(stake where chosen == oracleOutcome) over conf bets
unifiedPot             = m.totalStake (public, plaintext) + confidentialTotalStake
unifiedWinningStake    = publicWinningStake + confidentialWinningStake
```

Each winner's payout is proportional to their stake within `unifiedWinningStake`, paid against `unifiedPot - fee`. Public winners get USDC.e back, confidential winners get cUSDC back.

### Why this is safe against over-claim attacks

A naive confidential-bet design would let a user submit `teEncryptedStake = 1000` to the bet record but actually only transfer `100` cUSDC. At resolution, the pool would record stake=1000, dilute other winners.

Sortes prevents this because **the same `teEncryptedStake` ciphertext is used for both purposes**:
1. `cUSDC.encryptedTransferFrom(user, pool, teEncryptedStake)` — cUSDC's CTX decrypts and performs the actual transfer.
2. The bet record stores the same `teEncryptedStake` and decrypts it at resolution.

Both must decrypt to the same plaintext (it's the same ciphertext). The user can't fork the value. If the cUSDC transfer fails (insufficient balance/allowance), the user's bet stays in the array but they have no actual cUSDC backing it — which means they get no payout because their stake decrypts to whatever they encrypted, but the pool doesn't have it. Their loss, not the protocol's.

## Phase 2 + Phase 3 tight integration

| Phase | Primitive | Where it's used in Sortes |
|---|---|---|
| Phase 2 | `BITE.submitCTX(0x1B)` — Conditional Transactions | `triggerResolution` and `triggerAggregateReveal` submit CTXs that decrypt all encrypted bets in one batch. The BITE committee delivers `onDecrypt` callback in the next block. |
| Phase 3 | `BITE.encryptTE(0x1D)` — Threshold encryption | `submitSealedBetWithEncryption` encrypts the outcome inline using the contract's own address as AAD, so the ciphertext is valid for the CTX submitter (this contract). |
| Phase 3 | `BITE.encryptECIES(0x1C)` — Re-encryption to viewer key | Inside `onDecrypt`, the contract re-encrypts each winner's payout amount under their viewer key. Off-chain observers see only the ciphertext via `encryptedPayoutOf`. The bettor decrypts client-side with their viewer private key. |

### Critical correctness: AAD binding

The Phase 3 EncryptTE precompile binds the produced ciphertext to `msg.sender` of the encryption call as Additional Authenticated Data. The Phase 2 SubmitCTX precompile validates that ciphertexts being submitted are bound to the calling contract.

This means:
- The contract that calls `encryptTE` must be the same contract that later calls `submitCTX`.
- If you encrypt in helper contract A and submit CTX from contract B, the precompile rejects with `CTXAbiToRlpConversionFailed (error 7)`.

Sortes solves this by encrypting **inside** `SealedPool` itself: `submitSealedBetWithEncryption` takes plaintext outcome, calls `BITE.encryptTE` with `msg.sender = address(this)`, and stores the resulting ciphertext. At resolution time, the same contract calls `BITE.submitCTX` with the same address as msg.sender. AAD is consistent, precompile accepts.

This is the second non-obvious diagnostic finding from working through the live integration. It's documented in `deployments/skale-base-sepolia.json` under `biteProtocol.diagnosticFindings`.

## Aggregate disclosure (live odds with privacy)

Polymarket-shape UX requires showing live per-outcome totals. Naive disclosure leaks individual bets:
- Reveal aggregate after every bet → observer sees the delta and infers the latest bet's direction.

Sortes gates aggregate reveals by an **N≥2 anti-deanonymization threshold**:
- `MIN_AGGREGATE_BATCH = 2`
- `triggerAggregateReveal(marketId)` reverts unless at least 2 unaggregated bets exist.
- The CTX decrypts a batch of new bets, sums by outcome, adds to public running totals.
- The delta between consecutive snapshots covers ≥2 bets, so no single bet's direction can be isolated.

Higher `MIN_AGGREGATE_BATCH` gives stronger anonymity at the cost of reveal cadence. UI can show "X new bets pending" while waiting.

## Pluggable oracle adapter

`SealedPool.setMarketOracleAdapter(marketId, adapterAddress)` delegates resolution authority for a specific market to an external contract. The adapter calls `reportOutcomeFromAdapter(marketId, outcome)` once it has determined the outcome.

This allows:
- Default v1 alpha: owner sets outcomes manually via `setOracleOutcome`.
- Production: register a `UmaOracleSink` instance that receives UMA OOv3 outcomes from Base Sepolia via the SKALE native message bridge (see `src/oracle/UmaOracleSink.sol`).
- Other oracle stacks (Reality.eth, Chainlink AnyAPI, multi-sig operators) plug in the same way.

## Conditional Transactions reserve management

Mirrors the [`TheGreatAxios/confidential-poker`](https://github.com/TheGreatAxios/confidential-poker) pattern:

- Constructor enforces `msg.value >= ctxCallbackValueWei * MIN_CTX_RESERVE_CALLBACKS` (default 10).
- `triggerResolution` and `triggerAggregateReveal` enforce that after the spend, the reserve is still ≥ minimum. Owner can withdraw excess to the treasury but never below the floor.
- Pool sweeps the BITE callback fee from its own balance; callers don't need to attach value.

Why this matters: BITE Phase 2 callbacks consume real ETH/CREDIT (per the skill, 0.06 ETH on mainnet). Without a reserve, a market could be created and bet on but never resolved because nobody funds the trigger. The minimum-reserve invariant guarantees liquidity for at least 10 callbacks at all times, with the operator topping up periodically.

## State machine

```
None → Open → AwaitingDecryption → Triggered → Resolved
                ↓                       ↓
              Cancelled               Cancelled
```

- `None`: sentinel slot 0
- `Open`: accepting bets and aggregate reveals
- `AwaitingDecryption`: oracle reported, ready for triggerResolution
- `Triggered`: CTX submitted, BITE committee processing
- `Resolved`: payouts ready
- `Cancelled`: refund mode (public bets refunded immediately, confidential bets v1.5)

## Test coverage

37 unit tests in `test/SealedPool.t.sol`:
- Constructor reserve invariant (3 tests)
- Market lifecycle (3 tests)
- Public bet submission, dual-encryption variant, viewer key handling (10 tests)
- Oracle reporting (4 tests)
- Resolution happy path with Phase 3 ECIES re-encryption verified (1 test)
- No-winners refund, cancellation refund (2 tests)
- Aggregate disclosure with N≥2 enforcement (4 tests)
- Pluggable oracle adapter (3 tests)
- Callback security (5 tests)
- Withdraw-excess-reserve invariant (1 test)
- Misc lifecycle, fee cap, max-bets cap (3 tests)

Tests run against `BiteMock` + `SubmitCTXMock` + `EncryptECIESMock` from `bite-solidity@1.0.1-stable.0`.

## What changes between v1 alpha and mainnet

| Area | v1 alpha (now) | Mainnet target |
|---|---|---|
| Public bets | Working live, USDC.e collateral | Same |
| Confidential bets | Architecture in place, awaiting cUSDC mainnet GA | Live |
| Oracle | Owner-set or UmaOracleSink admin push | UMA OOv3 cross-chain via SKALE IMA |
| Audit | Pre-audit | ChainSecurity / Trail of Bits review |
| BITE Phase 3 | Working on testnet, infra tweaks pending for production per SKALE Labs | Production-stable |

## Open architecture questions for v1.5

1. **Confidential bet cancellation refund.** Cancelling a market that contains confidential bets requires decrypting their stakes for refund. v1.5 will add a separate `triggerRefundCTX` CTX kind that handles this without leaking outcomes.
2. **Encrypted track record.** Per-bettor cumulative encrypted Brier score, selectively revealable to recruiters or hedge funds via viewer key delegation. Numerai-style reputation primitive on top of the prediction market.
3. **Aggregate disclosure for confidential side.** Currently the confidential pool TVL stays fully dark until resolution. v1.5 could add aggregate disclosure for the confidential side too (sum of stakes per outcome) using the same N≥2 pattern.
