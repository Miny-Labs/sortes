// TypeScript types matching the SealedPool contract.
// SPDX-License-Identifier: AGPL-3.0-only

export enum MarketStatus {
  None = 0,
  Open = 1,
  AwaitingOracle = 2,
  AwaitingDecryption = 3,
  Triggered = 4,
  Resolved = 5,
  Cancelled = 6,
}

export interface PublicKey {
  x: string; // 0x-prefixed bytes32
  y: string; // 0x-prefixed bytes32
}

export interface MarketInfo {
  question: string;
  outcomeCount: bigint;
  submissionDeadline: bigint;
  resolutionTime: bigint;
  collateral: string;
  status: MarketStatus;
  oracleOutcome: bigint;
  oracleReported: boolean;
  totalStake: bigint;
  winningStake: bigint;
  numBets: bigint;
}

export interface BetInfo {
  bettor: string;
  stake: bigint;
  teEncryptedOutcome: string; // 0x-hex
  eciesEncryptedOutcome: string;
  eciesEncryptedPayout: string;
  chosenOutcome: bigint;
  decrypted: boolean;
  redeemed: boolean;
}

export interface ViewerKeyPair {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // 33 bytes (compressed) or 65 bytes (uncompressed)
  pubKey: PublicKey; // 32-byte x and y for contract calls
}
