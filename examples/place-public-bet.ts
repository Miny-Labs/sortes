// Runnable example: place a public bet on a Sortes market.
// SPDX-License-Identifier: AGPL-3.0-only
//
// Usage:
//   1. Have USDC.e on SKALE Base Sepolia in your wallet.
//   2. Set DEPLOYER_PRIVATE_KEY in .env.
//   3. npx tsx examples/place-public-bet.ts <marketId> <outcome> <stakeUSDC>
//
// This script:
//   - generates a fresh viewer keypair (saves privateKey to viewer-key.txt)
//   - approves USDC.e to the pool
//   - submits a sealed bet
//   - polls for resolution
//   - decrypts the encrypted payout claim once the market resolves
//   - redeems the winning USDC.e

import "dotenv/config";
import { JsonRpcProvider, Wallet, parseUnits } from "ethers";
import { writeFileSync } from "node:fs";

import { CHAIN, MarketStatus, SortesClient } from "../sdk";

async function main() {
  const [marketIdStr, outcomeStr, stakeStr] = process.argv.slice(2);
  if (!marketIdStr || !outcomeStr || !stakeStr) {
    console.error("usage: place-public-bet <marketId> <outcome> <stakeUSDC>");
    process.exit(1);
  }
  const marketId = BigInt(marketIdStr);
  const outcome = BigInt(outcomeStr);
  const stakeUsdc = parseUnits(stakeStr, 6);

  const provider = new JsonRpcProvider(CHAIN.rpcUrl);
  const signer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const sortes = new SortesClient(signer);

  console.log("Generating viewer keypair...");
  const viewer = SortesClient.newViewerKey();
  writeFileSync(
    "viewer-key.txt",
    `0x${Buffer.from(viewer.privateKey).toString("hex")}`,
  );
  console.log("Saved private key to viewer-key.txt — guard it.");

  console.log("Approving USDC.e to pool (max)...");
  await sortes.approveUsdcMax();

  console.log(`Submitting public bet: market ${marketId}, outcome ${outcome}, stake ${stakeStr} USDC.e`);
  const tx = await sortes.submitPublicBet({
    marketId,
    plaintextOutcome: outcome,
    viewerKey: viewer.pubKey,
    stake: stakeUsdc,
  });
  const receipt = await tx.wait();
  console.log("Bet submitted:", receipt!.hash);

  // Find betIndex from the SealedBetSubmitted event.
  const betEvent = receipt!.logs
    .map((l) => sortes.pool.interface.parseLog({ topics: [...l.topics], data: l.data }))
    .find((e) => e?.name === "SealedBetSubmitted");
  const betIndex = betEvent!.args.betIndex as bigint;
  console.log(`Bet index: ${betIndex}`);

  console.log("Waiting for market to resolve (poll every 30s)...");
  let status = await sortes.statusOf(marketId);
  while (status !== MarketStatus.Resolved && status !== MarketStatus.Cancelled) {
    await new Promise((r) => setTimeout(r, 30_000));
    status = await sortes.statusOf(marketId);
    console.log(`  status: ${MarketStatus[status]}`);
  }

  if (status === MarketStatus.Cancelled) {
    console.log("Market cancelled. Redeeming refund...");
  } else {
    const cipher = await sortes.encryptedPayoutOf(marketId, betIndex);
    if (cipher === "0x" || cipher === "0x" + "00".repeat(64)) {
      console.log("This bet did not win.");
      return;
    }
    const payout = SortesClient.decryptPayout(cipher, viewer.privateKey);
    console.log(`Encrypted payout decrypted: ${payout} (raw uint256 wei). Redeeming...`);
  }

  const redeemTx = await sortes.redeem(marketId, betIndex);
  await redeemTx.wait();
  console.log("Redeemed:", redeemTx.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
