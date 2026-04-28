#!/usr/bin/env bash
# Sortes end-to-end demo on SKALE Base Sepolia.
# PROVES the full Phase 2 + Phase 3 flow against real precompiles, no mocks.
#
# Lifecycle:
#   1. Top up SealedPool CTX reserve (callback funding).
#   2. Create binary market with tight deadlines.
#   3. Approve USDC.e to pool.
#   4. Submit sealed bet via inline encryption (Phase 3 EncryptTE 0x1D +
#      EncryptECIES 0x1C from inside SealedPool's own context, so AAD = pool).
#   5. Wait past resolution time.
#   6. Set oracle outcome.
#   7. Trigger resolution (Phase 2 SubmitCTX 0x1B). BITE committee delivers
#      onDecrypt callback in the next block.
#   8. Verify Resolved status, redeem.
#
# Why "inline encryption": SKALE precompiles bind ciphertext to msg.sender as
# AAD. The address that encrypts MUST equal the address that later submits the
# CTX. SealedPool encrypts and submits, so all msg.senders match.
# For real privacy, users wrap this tx with bite-ts Phase 1 so the plaintext
# outcome stays encrypted in the mempool until execution. Production-grade
# clients should produce both ciphertexts client-side via bite-ts and use
# submitSealedBet (the dual-encryption variant) directly.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

POOL=0x05aD32257EE764721D9f97BDD1520ed1146701E3
RPC="$SKALE_BASE_SEPOLIA_RPC"
PK="$DEPLOYER_PRIVATE_KEY"
USDC="$USDC_E_ADDRESS"

# Canonical secp256k1 generator point. Real users supply their own pubkey.
PUB_X="0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798"
PUB_Y="0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8"

TOP_UP=5000000000000000          # 0.005 CREDIT extra so trigger has headroom
STAKE=1000000                    # 1 USDC.e (6 decimals)

echo "═══ Sortes E2E demo on SKALE Base Sepolia ═══"
echo "Pool:     $POOL"
echo "Deployer: $DEPLOYER_ADDRESS"
echo ""

echo "[1/8] Top up CTX reserve (+0.005 CREDIT)"
cast send "$POOL" --value "$TOP_UP" --rpc-url "$RPC" --private-key "$PK" --legacy 2>&1 \
  | grep -E "transactionHash|status" | head -2
echo ""

echo "[2/8] Create binary market with tight deadlines"
NOW=$(date +%s)
DEADLINE=$((NOW + 25))
RESOLUTION=$((NOW + 35))
cast send "$POOL" \
  "createMarket(string,uint256,uint256,uint256,address)(uint256)" \
  "Sortes E2E live demo: Phase 2 + Phase 3 binary market" \
  2 "$DEADLINE" "$RESOLUTION" "$USDC" \
  --rpc-url "$RPC" --private-key "$PK" --legacy 2>&1 \
  | grep -E "transactionHash|status" | head -2
MARKET_ID=$(cast call "$POOL" "marketCount()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
echo "marketId: $MARKET_ID"
echo ""

echo "[3/8] Approve $((STAKE / 1000000)) USDC.e to pool"
cast send "$USDC" "approve(address,uint256)" "$POOL" "$STAKE" \
  --rpc-url "$RPC" --private-key "$PK" --legacy 2>&1 \
  | grep -E "transactionHash|status" | head -2
echo ""

echo "[4/8] Submit sealed bet via inline encryption"
echo "      Phase 3 EncryptTE (0x1D) + EncryptECIES (0x1C) from pool context"
cast send "$POOL" \
  "submitSealedBetWithEncryption(uint256,uint256,(bytes32,bytes32),uint256)" \
  "$MARKET_ID" 1 "($PUB_X,$PUB_Y)" "$STAKE" \
  --rpc-url "$RPC" --private-key "$PK" --legacy --gas-limit 2000000 2>&1 \
  | grep -E "transactionHash|status" | head -2
echo ""

REMAIN=$(( RESOLUTION - $(date +%s) + 2 ))
echo "[5/8] Sleep ${REMAIN}s past resolution time"
[ "$REMAIN" -gt 0 ] && sleep "$REMAIN"
echo ""

echo "[6/8] Set oracle outcome = 1 (winner)"
cast send "$POOL" "setOracleOutcome(uint256,uint256)" "$MARKET_ID" 1 \
  --rpc-url "$RPC" --private-key "$PK" --legacy 2>&1 \
  | grep -E "transactionHash|status" | head -2
echo ""

echo "[7/8] Trigger resolution via Phase 2 SubmitCTX (0x1B)"
cast send "$POOL" "triggerResolution(uint256)" "$MARKET_ID" \
  --rpc-url "$RPC" --private-key "$PK" --legacy 2>&1 \
  | grep -E "transactionHash|status" | head -2
echo ""

echo "Wait 8s for BITE committee onDecrypt callback"
sleep 8
STATUS=$(cast call "$POOL" "statusOf(uint256)(uint8)" "$MARKET_ID" --rpc-url "$RPC" | awk '{print $1}')
echo "Status: $STATUS (5 = Resolved)"

if [ "$STATUS" = "5" ]; then
  echo ""
  echo "✓ MARKET RESOLVED via real BITE precompiles"
  echo ""
  echo "[8/8] Redeem winning bet"
  BAL_BEFORE=$(cast call "$USDC" "balanceOf(address)(uint256)" "$DEPLOYER_ADDRESS" --rpc-url "$RPC" | awk '{print $1}')
  cast send "$POOL" "redeem(uint256,uint256)" "$MARKET_ID" 0 \
    --rpc-url "$RPC" --private-key "$PK" --legacy 2>&1 \
    | grep -E "transactionHash|status" | head -2
  BAL_AFTER=$(cast call "$USDC" "balanceOf(address)(uint256)" "$DEPLOYER_ADDRESS" --rpc-url "$RPC" | awk '{print $1}')
  DELTA=$((BAL_AFTER - BAL_BEFORE))
  echo "USDC.e returned: $DELTA wei = $(echo "scale=6; $DELTA / 1000000" | bc) USDC.e"
  echo "(Stake $STAKE USDC.e wei minus 1% protocol fee = ${DELTA} wei expected)"
fi
