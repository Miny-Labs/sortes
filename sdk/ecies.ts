// Client-side ECIES helpers matching SKALE BITE's EncryptECIES precompile.
// SPDX-License-Identifier: AGPL-3.0-only
//
// Format: IV(16) || ephemeralPubKey(33 compressed) || ciphertext
// KDF: SHA-256(ECDH shared secret)
// Cipher: AES-256-CBC
//
// Used to:
//   - generate viewer keypairs
//   - encrypt locally for submitConfidentialBet (eciesEncryptedDirection / Stake)
//   - decrypt encryptedPayoutOf / confidentialEncryptedPayoutOf returned by SealedPool

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { cbc } from "@noble/ciphers/aes";
import { randomBytes } from "@noble/hashes/utils";

import type { PublicKey, ViewerKeyPair } from "./types";

const IV_LEN = 16;
const EPH_PUB_LEN = 33;

/**
 * Generate a fresh secp256k1 keypair to use as a viewer key. Persist the
 * privateKey securely (off chain) — it is the only way to decrypt your
 * ciphertexts later.
 */
export function generateViewerKeyPair(): ViewerKeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, false); // 65-byte uncompressed
  // SKALE PublicKey struct uses raw 32-byte x and y (no 0x04 prefix).
  const x = publicKey.slice(1, 33);
  const y = publicKey.slice(33, 65);
  return {
    privateKey,
    publicKey,
    pubKey: {
      x: "0x" + bytesToHex(x),
      y: "0x" + bytesToHex(y),
    },
  };
}

/**
 * ECIES encrypt `plaintext` for the recipient's public key.
 * Returns the ciphertext bytes ready to be passed to a contract call.
 */
export function eciesEncrypt(plaintext: Uint8Array, recipient: PublicKey): Uint8Array {
  const recipientPubKey = pubKeyToBytes(recipient);
  const ephemeralPriv = secp256k1.utils.randomPrivateKey();
  const ephemeralPub = secp256k1.getPublicKey(ephemeralPriv, true); // 33-byte compressed
  const sharedSecret = secp256k1.getSharedSecret(ephemeralPriv, recipientPubKey).slice(1); // strip 0x04 prefix
  const aesKey = sha256(sharedSecret);
  const iv = randomBytes(IV_LEN);
  const ciphertext = cbc(aesKey, iv).encrypt(plaintext);
  return concatBytes(iv, ephemeralPub, ciphertext);
}

/**
 * ECIES decrypt a ciphertext using your viewer private key. Throws if the
 * format is wrong or the AES decrypt fails.
 */
export function eciesDecrypt(ciphertext: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (ciphertext.length < IV_LEN + EPH_PUB_LEN + 16) {
    throw new Error("ciphertext too short for ECIES format");
  }
  const iv = ciphertext.slice(0, IV_LEN);
  const ephemeralPub = ciphertext.slice(IV_LEN, IV_LEN + EPH_PUB_LEN);
  const ct = ciphertext.slice(IV_LEN + EPH_PUB_LEN);
  const sharedSecret = secp256k1.getSharedSecret(privateKey, ephemeralPub).slice(1);
  const aesKey = sha256(sharedSecret);
  return cbc(aesKey, iv).decrypt(ct);
}

/**
 * Decode an ECIES-encrypted uint256 payout amount returned by SealedPool's
 * encryptedPayoutOf / confidentialEncryptedPayoutOf views. Returns the
 * payout as a bigint.
 */
export function decryptPayoutAmount(ciphertextHex: string, privateKey: Uint8Array): bigint {
  if (!ciphertextHex || ciphertextHex === "0x") return 0n;
  const ciphertext = hexToBytes(ciphertextHex);
  const plaintext = eciesDecrypt(ciphertext, privateKey);
  // The contract encrypts abi.encode(uint256), so the plaintext is
  // 32-byte big-endian. Padded by AES-CBC; trim to 32 bytes.
  const trimmed = plaintext.length > 32 ? plaintext.slice(0, 32) : plaintext;
  return BigInt("0x" + bytesToHex(trimmed));
}

// ─── helpers ─────────────────────────────────────────────────────────────

function pubKeyToBytes(pk: PublicKey): Uint8Array {
  const x = hexToBytes(pk.x);
  const y = hexToBytes(pk.y);
  // Build uncompressed point: 0x04 || x(32) || y(32).
  return new Uint8Array([0x04, ...x, ...y]);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
