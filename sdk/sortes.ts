// SortesClient — high-level wrapper around the SealedPool + cUSDC contracts.
// SPDX-License-Identifier: AGPL-3.0-only

import { Contract, ethers, type ContractRunner, type Signer } from "ethers";

import { ADDRESSES, BITE_PRECOMPILES, CHAIN } from "./addresses";
import { decryptPayoutAmount, eciesEncrypt, generateViewerKeyPair } from "./ecies";
import type { BetInfo, MarketInfo, MarketStatus, PublicKey, ViewerKeyPair } from "./types";

import SealedPoolAbi from "../abi/SealedPool.json" assert { type: "json" };

const ERC20_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export interface SortesClientConfig {
  poolAddress?: string;
  cUSDCAddress?: string;
  usdcEAddress?: string;
}

export class SortesClient {
  readonly pool: Contract;
  readonly usdce: Contract;
  readonly cUSDC: Contract;
  readonly runner: ContractRunner;

  constructor(runner: ContractRunner, config: SortesClientConfig = {}) {
    this.runner = runner;
    this.pool = new Contract(
      config.poolAddress ?? ADDRESSES.SealedPool,
      SealedPoolAbi,
      runner,
    );
    this.usdce = new Contract(
      config.usdcEAddress ?? ADDRESSES.USDC_e,
      ERC20_ABI,
      runner,
    );
    this.cUSDC = new Contract(
      config.cUSDCAddress ?? ADDRESSES.ConfidentialWrapper_cUSDC,
      ERC20_ABI,
      runner,
    );
  }

  // ─── reads ────────────────────────────────────────────────────────────

  async marketCount(): Promise<bigint> {
    return this.pool.marketCount();
  }

  async marketInfo(marketId: bigint | number): Promise<MarketInfo> {
    const r = await this.pool.marketInfo(marketId);
    return {
      question: r[0],
      outcomeCount: r[1],
      submissionDeadline: r[2],
      resolutionTime: r[3],
      collateral: r[4],
      status: Number(r[5]) as MarketStatus,
      oracleOutcome: r[6],
      oracleReported: r[7],
      totalStake: r[8],
      winningStake: r[9],
      numBets: r[10],
    };
  }

  async statusOf(marketId: bigint | number): Promise<MarketStatus> {
    return Number(await this.pool.statusOf(marketId)) as MarketStatus;
  }

  async betInfo(marketId: bigint | number, betIndex: bigint | number): Promise<BetInfo> {
    const r = await this.pool.betInfo(marketId, betIndex);
    return {
      bettor: r[0],
      stake: r[1],
      teEncryptedOutcome: r[2],
      eciesEncryptedOutcome: r[3],
      eciesEncryptedPayout: r[4],
      chosenOutcome: r[5],
      decrypted: r[6],
      redeemed: r[7],
    };
  }

  /// Per-outcome plaintext aggregate stake total (visible after enough
  /// triggerAggregateReveal calls).
  async aggregatePerOutcome(marketId: bigint | number, outcome: bigint | number): Promise<bigint> {
    return this.pool.aggregatePerOutcome(marketId, outcome);
  }

  /// How many bets have been folded into the public aggregate so far.
  async aggregatedUpToIndex(marketId: bigint | number): Promise<bigint> {
    return this.pool.aggregatedUpToIndex(marketId);
  }

  /// Reads the encrypted payout claim for a given public bet. Returns "0x" if
  /// the bet didn't win. Pass the result + the bettor's viewerKey privateKey
  /// to decryptPayoutAmount() to learn the plaintext.
  async encryptedPayoutOf(marketId: bigint | number, betIndex: bigint | number): Promise<string> {
    return this.pool.encryptedPayoutOf(marketId, betIndex);
  }

  async usdcBalanceOf(addr: string): Promise<bigint> {
    return this.usdce.balanceOf(addr);
  }

  // ─── writes (require Signer) ─────────────────────────────────────────

  /// Convenience: ensure max approval on USDC.e to the pool.
  async approveUsdcMax(): Promise<void> {
    const tx = await this.usdce.approve(this.pool.target, ethers.MaxUint256);
    await tx.wait();
  }

  /// Submit a public-side sealed bet. Pool encrypts inline (Phase 3) under
  /// its own AAD so the resulting ciphertext is valid for SubmitCTX at
  /// resolution. Stake is paid in plaintext USDC.e; outcome stays encrypted.
  async submitPublicBet(args: {
    marketId: bigint | number;
    plaintextOutcome: bigint | number;
    viewerKey: PublicKey;
    stake: bigint;
  }): Promise<ethers.ContractTransactionResponse> {
    return this.pool.submitSealedBetWithEncryption(
      args.marketId,
      args.plaintextOutcome,
      args.viewerKey,
      args.stake,
    );
  }

  /// Trigger aggregate reveal for a market. Anyone can call. Reverts if
  /// fewer than MIN_AGGREGATE_BATCH (=2) unaggregated bets exist.
  async triggerAggregateReveal(marketId: bigint | number): Promise<ethers.ContractTransactionResponse> {
    return this.pool.triggerAggregateReveal(marketId);
  }

  /// Set the oracle outcome (admin only) and trigger resolution. Returns the
  /// resolution tx; the BITE callback delivers onDecrypt in the next block.
  async resolveMarket(args: {
    marketId: bigint | number;
    outcome: bigint | number;
  }): Promise<ethers.ContractTransactionResponse> {
    const oracleTx = await this.pool.setOracleOutcome(args.marketId, args.outcome);
    await oracleTx.wait();
    return this.pool.triggerResolution(args.marketId);
  }

  async redeem(marketId: bigint | number, betIndex: bigint | number): Promise<ethers.ContractTransactionResponse> {
    return this.pool.redeem(marketId, betIndex);
  }

  /// Submit a confidential-side bet. Caller must produce four ciphertexts
  /// client-side (TE direction, TE stake, ECIES direction, ECIES stake).
  /// The same teEncryptedStake is used for cUSDC.encryptedTransferFrom AND
  /// stored in the bet record, so amounts cannot diverge.
  async submitConfidentialBet(args: {
    marketId: bigint | number;
    teEncryptedDirection: string;
    teEncryptedStake: string;
    eciesEncryptedDirection: string;
    eciesEncryptedStake: string;
    viewerKey: PublicKey;
  }): Promise<ethers.ContractTransactionResponse> {
    return this.pool.submitConfidentialBet(
      args.marketId,
      args.teEncryptedDirection,
      args.teEncryptedStake,
      args.eciesEncryptedDirection,
      args.eciesEncryptedStake,
      args.viewerKey,
    );
  }

  async redeemConfidential(
    marketId: bigint | number,
    betIndex: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> {
    return this.pool.redeemConfidential(marketId, betIndex);
  }

  // ─── viewer-key helpers ──────────────────────────────────────────────

  /// Generate a fresh viewer keypair. The privateKey must be persisted off
  /// chain by the caller. Lose it and you can no longer decrypt your
  /// position or your payout (funds themselves are still redeemable via
  /// the bettor address; only off-chain visibility is lost).
  static newViewerKey(): ViewerKeyPair {
    return generateViewerKeyPair();
  }

  /// Convenience: decrypt the encrypted payout claim returned by
  /// encryptedPayoutOf / confidentialEncryptedPayoutOf.
  static decryptPayout(ciphertextHex: string, viewerPrivateKey: Uint8Array): bigint {
    return decryptPayoutAmount(ciphertextHex, viewerPrivateKey);
  }
}

export { ADDRESSES, BITE_PRECOMPILES, CHAIN, eciesEncrypt };
