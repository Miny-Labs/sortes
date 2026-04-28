# Sortes Frontend Integration Guide

This is the integration guide for building a frontend or SDK against the
deployed Sortes `SealedPool` on SKALE Base Sepolia. It assumes you've read
the architecture overview in [README.md](README.md).

## Network and addresses

```ts
export const SKALE_BASE_SEPOLIA = {
  chainId: 324_705_682,
  rpcUrl: "https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha",
  explorer: "https://base-sepolia-testnet-explorer.skalenodes.com",
  nativeToken: "CREDIT", // ETH-equivalent on this chain
} as const;

export const ADDRESSES = {
  SealedPool:    "0x04DFB8B3A9ed4017151f5f1a4427eD51cF02C589", // production v3 (unified TVL)
  USDC_e:        "0x2e08028E3C4c2356572E096d8EF835cD5C6030bD", // bridged USDC
  Permit2:       "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;

// Phase 2 / Phase 3 BITE precompiles (canonical)
export const BITE_PRECOMPILES = {
  submitCTX:     "0x000000000000000000000000000000000000001B",
  encryptECIES:  "0x000000000000000000000000000000000000001C",
  encryptTE:     "0x000000000000000000000000000000000000001D",
} as const;
```

ABIs are in [`abi/SealedPool.json`](abi/SealedPool.json) and [`abi/UmaOracleSink.json`](abi/UmaOracleSink.json).

## Two market types in one contract

Each market stores **two parallel bet arrays**:
- `bets[]` — public side, plaintext stake, encrypted direction (Phase 3).
- `confidentialBets[]` — confidential side, encrypted stake AND direction (cUSDC).

At resolution the contract decrypts both in one batch CTX and computes a unified pot. Whales on the confidential side get matched against losing bets from both arrays. No fragmented liquidity.

## Public-side flow (USDC.e collateral)

### Submit a bet

```ts
import { ethers } from "ethers";
import { computePublicKey } from "ethers";
import SealedPoolAbi from "./abi/SealedPool.json";

const pool = new ethers.Contract(ADDRESSES.SealedPool, SealedPoolAbi, signer);
const usdc = new ethers.Contract(ADDRESSES.USDC_e, ERC20_ABI, signer);

// 1. Approve USDC.e (one-time)
await usdc.approve(ADDRESSES.SealedPool, ethers.MaxUint256);

// 2. Generate a viewer keypair for self-decryption of position + payout
const viewerWallet = ethers.Wallet.createRandom();
const pubKey = computePublicKey(viewerWallet.privateKey, false);
// 65-byte uncompressed: 0x04 || x(32) || y(32). Strip 0x04 prefix.
const x = "0x" + pubKey.slice(4, 4 + 64);
const y = "0x" + pubKey.slice(4 + 64, 4 + 128);

// 3. Submit. The contract encrypts the outcome inline using its own
//    address as AAD (so the resulting ciphertext is valid for SubmitCTX
//    later), via Phase 3 EncryptTE + EncryptECIES.
const tx = await pool.submitSealedBetWithEncryption(
  marketId,
  outcome, // uint256, e.g. 0 for NO, 1 for YES
  { x, y }, // PublicKey struct
  ethers.parseUnits("10", 6), // 10 USDC.e (6 decimals)
);
await tx.wait();
```

**Important**: store `viewerWallet.privateKey` securely off chain. You'll need it to decrypt your position and your payout. Lose the key, lose visibility of your encrypted balance (the funds themselves are not lost — they redeem via `bet.bettor` address).

### Read aggregate odds (live)

```ts
const totalYes = await pool.aggregatePerOutcome(marketId, 1);
const totalNo = await pool.aggregatePerOutcome(marketId, 0);
const aggregatedCount = await pool.aggregatedUpToIndex(marketId);
const totalBets = await pool.betCountOf(marketId);
const unaggregatedCount = totalBets - aggregatedCount;

const total = totalYes + totalNo;
const impliedYesProbability = total > 0n ? Number(totalYes * 10000n / total) / 100 : 50;
```

### Trigger an aggregate reveal

Anyone can call this to refresh the public per-outcome totals. Must be at least 2 unaggregated bets (anti-deanonymization).

```ts
const unagg = (await pool.betCountOf(marketId)) - (await pool.aggregatedUpToIndex(marketId));
if (unagg >= 2n) {
  const tx = await pool.triggerAggregateReveal(marketId);
  await tx.wait();
}
```

### Trigger resolution

Once oracle outcome is set (admin or via adapter):

```ts
const tx = await pool.triggerResolution(marketId);
await tx.wait();
// BITE callback delivers onDecrypt in next block. Status moves to 5 (Resolved).
```

### Redeem

```ts
const status = await pool.statusOf(marketId);
if (Number(status) === 5) {
  // Resolved
  const tx = await pool.redeem(marketId, betIndex);
  await tx.wait();
  // USDC.e returned to bet.bettor.
}
```

### Decrypt your encrypted payout claim off chain

```ts
import { eciesDecrypt } from "./eciesClient"; // see below

const cipher = await pool.encryptedPayoutOf(marketId, betIndex);
if (cipher.length > 0) {
  const plaintext = eciesDecrypt(cipher, viewerWallet.privateKey);
  const payout = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], plaintext)[0];
  console.log("My payout:", ethers.formatUnits(payout, 6), "USDC.e");
}
```

## Confidential-side flow (cUSDC collateral)

The confidential path settles in cUSDC (the SKALE Confidential Token wrapping USDC.e). Stake amount AND direction are both encrypted on chain. Pool reserves are encrypted.

**Status:** the contract architecture is in place. Live use requires deploying a `ConfidentialWrapper` instance against USDC.e on the target chain and calling `setMarketConfidentialCollateral(marketId, cUSDC)`. The SKALE Confidential Token mainnet GA is gated on the SKALE Labs audit + infra tweaks (see [SKALE Labs Telegram thread](https://t.me/skaleofficial)). On testnet you can deploy a `ConfidentialWrapper` immediately following the `skalenetwork/confidential-token` repo's deploy scripts.

### Setup (admin)

```ts
// 1. Deploy ConfidentialWrapper against USDC.e (use confidential-token repo).
const cUSDCAddress = "0x..."; // your deployed wrapper

// 2. Enable confidential bets on a market.
await pool.setMarketConfidentialCollateral(marketId, cUSDCAddress);
```

### Submit a confidential bet

```ts
// User must own cUSDC and have approved SealedPool.

// Compute four ciphertexts client-side using bite-ts and viewer key:
import { BITE } from "@skalenetwork/bite";
const bite = new BITE(SKALE_BASE_SEPOLIA.rpcUrl);

// TE ciphertexts: encrypt under network threshold key, AAD = SealedPool addr.
const teEncDirection = await bite.encryptMessageForCTX(
  ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [outcome]),
  ADDRESSES.SealedPool
);
const teEncStake = await bite.encryptMessageForCTX(
  ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [stakeAmount]),
  cUSDCAddress // AAD = cUSDC contract; this ciphertext is also passed to cUSDC.encryptedTransferFrom
);

// ECIES ciphertexts: encrypt for self-view via viewer key.
const eciesEncDirection = await eciesEncrypt(outcome, viewerPubKey);
const eciesEncStake = await eciesEncrypt(stakeAmount, viewerPubKey);

const tx = await pool.submitConfidentialBet(
  marketId,
  teEncDirection,
  teEncStake,        // ALSO used as cUSDC.encryptedTransferFrom payload
  eciesEncDirection,
  eciesEncStake,
  { x: viewerPubKeyX, y: viewerPubKeyY },
);
await tx.wait();
// Stake amount and direction stay opaque on chain forever (until resolution).
```

### Redeem a confidential bet

After resolution, payouts are paid out as cUSDC via `encryptedTransfer`:

```ts
const tx = await pool.redeemConfidential(marketId, confidentialBetIndex);
await tx.wait();
// cUSDC.encryptedTransfer fires. Winner's cUSDC encrypted balance increases.
```

To decrypt the encrypted payout claim:
```ts
const cipher = await pool.confidentialEncryptedPayoutOf(marketId, betIndex);
const payout = decryptECIES(cipher, viewerPrivateKey);
```

## Client-side ECIES (for self-view)

Format: `IV(16) || ephemeralPubKey(33, compressed) || ciphertext`.

```ts
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { Cipher } from "@noble/ciphers/aes";

// Encrypt (under recipient's pub key)
function eciesEncrypt(plaintext: Uint8Array, pubKey: Uint8Array): Uint8Array {
  const ephemeral = secp256k1.utils.randomPrivateKey();
  const ephemeralPub = secp256k1.getPublicKey(ephemeral, true); // 33 bytes
  const sharedSecret = secp256k1.getSharedSecret(ephemeral, pubKey);
  const aesKey = sha256(sharedSecret);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cipher = new Cipher(aesKey, iv).encrypt(plaintext);
  return new Uint8Array([...iv, ...ephemeralPub, ...cipher]);
}

// Decrypt (using your private key)
function eciesDecrypt(ciphertext: Uint8Array, privKey: Uint8Array): Uint8Array {
  const iv = ciphertext.slice(0, 16);
  const ephemeralPub = ciphertext.slice(16, 49);
  const ct = ciphertext.slice(49);
  const sharedSecret = secp256k1.getSharedSecret(privKey, ephemeralPub);
  const aesKey = sha256(sharedSecret);
  return new Cipher(aesKey, iv).decrypt(ct);
}
```

## Events to subscribe to

```ts
pool.on("MarketCreated", (marketId, question, outcomeCount, deadline, resolution, collateral) => {
  // ... add to UI
});

pool.on("SealedBetSubmitted", (marketId, bettor, betIndex, stake) => { ... });
pool.on("ConfidentialBetSubmitted", (marketId, bettor, betIndex) => { ... });
pool.on("AggregateUpdated", (marketId, outcome, newAggregate, totalAggregatedBets) => { ... });
pool.on("ResolutionTriggered", (marketId, callbackSender, oracleOutcome) => { ... });
pool.on("MarketResolved", (marketId, winningOutcome, totalStake, winningStake) => { ... });
pool.on("Redeemed", (marketId, bettor, amount) => { ... });
pool.on("ConfidentialRedeemed", (marketId, bettor, betIndex, payout) => { ... });
```

## MarketStatus enum

```ts
enum MarketStatus {
  None = 0,
  Open = 1,
  AwaitingOracle = 2,
  AwaitingDecryption = 3,  // oracle reported, ready for triggerResolution
  Triggered = 4,            // CTX submitted, awaiting BITE callback
  Resolved = 5,             // ready to redeem
  Cancelled = 6,
}
```

## Common pitfalls

1. **Viewer key must be a real secp256k1 point.** The Phase 3 `encryptECIES` precompile validates curve membership. Use `ethers.computePublicKey` or `secp256k1.getPublicKey`, not arbitrary bytes32.
2. **Compile contracts with `evm_version="istanbul"`.** BITE precompiles do not respond to bytecode targeted at cancun. The skill is explicit about this.
3. **CTX requires reserve.** Each CTX trigger consumes `ctxCallbackValueWei` from the pool's balance. Operator must keep the contract topped up; UI should warn when reserve is approaching `minimumCtxReserve()`.
4. **Aggregate disclosure has a 2-bet minimum.** First bet alone cannot be aggregated; UI should encourage at least 2 bettors before showing live odds.
5. **Confidential payouts are async.** `redeemConfidential` calls `cUSDC.encryptedTransfer`, which itself triggers a CTX. Wallet sees the cUSDC balance update one block later, not immediately.

## What the SealedPool does NOT do

- KYC. If your jurisdiction requires it, gate access at the frontend.
- Resolution oracle by default. Owner sets oracle outcomes manually unless an adapter is registered via `setMarketOracleAdapter`. Use `UmaOracleSink` (in `src/oracle/`) for UMA cross-chain oracle bridging once the Base Sepolia side is wired.
- Continuous trading. Sortes is parimutuel: pot is paid out at resolution, not continuously.

## Reference projects

- [`skalenetwork/confidential-token`](https://github.com/skalenetwork/confidential-token) — cUSDC implementation + audit-quality patterns.
- [`TheGreatAxios/confidential-poker`](https://github.com/TheGreatAxios/confidential-poker) — full Phase 2 + Phase 3 game loop. Sortes mirrors its architecture for batch decryption.
- [`Polymarket/conditional-tokens-contracts`](https://github.com/Polymarket/conditional-tokens-contracts) — for the public AMM extension path (v2 roadmap).
