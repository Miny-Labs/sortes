"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { parseUnits } from "viem";

import { ADDRESSES, ERC20_ABI, SEALED_POOL_ABI } from "../lib/contracts";
import type { MarketData } from "../lib/markets";

interface Props {
  market: MarketData;
  onSubmitted?: () => void;
}

export function BetForm({ market, onSubmitted }: Props) {
  const { address } = useAccount();
  const [outcome, setOutcome] = useState<bigint>(1n);
  const [amount, setAmount] = useState<string>("1");
  const [confidential, setConfidential] = useState(false);
  const [viewerKey, setViewerKey] = useState<{ x: `0x${string}`; y: `0x${string}` } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: allowance } = useReadContract({
    address: ADDRESSES.USDC_e,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.SealedPool] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync, isPending } = useWriteContract();

  const stakeWei = (() => {
    try {
      return parseUnits(amount || "0", 6);
    } catch {
      return 0n;
    }
  })();
  const needsApproval = (allowance as bigint | undefined) === undefined || (allowance as bigint) < stakeWei;

  const handleApprove = async () => {
    setError(null);
    try {
      await writeContractAsync({
        address: ADDRESSES.USDC_e,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.SealedPool, BigInt(2) ** BigInt(255)],
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const generateViewerKey = async () => {
    // Generate fresh viewer keypair via the noble libs.
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const priv = secp256k1.utils.randomPrivateKey();
    const pub = secp256k1.getPublicKey(priv, false); // 65-byte uncompressed
    const x = `0x${Array.from(pub.slice(1, 33)).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
    const y = `0x${Array.from(pub.slice(33, 65)).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
    const privHex = Array.from(priv).map((b) => b.toString(16).padStart(2, "0")).join("");
    // Persist private key in localStorage tied to (chain, market, address).
    if (address) {
      const key = `sortes:viewerKey:${address}:${market.id}`;
      localStorage.setItem(key, privHex);
    }
    setViewerKey({ x, y });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!viewerKey) {
      setError("Generate a viewer key first.");
      return;
    }
    try {
      if (confidential) {
        setError("Confidential bets require cnfUSDC.e in your wallet. Wrapping flow not yet wired in this UI; use the SDK directly.");
        return;
      }
      await writeContractAsync({
        address: ADDRESSES.SealedPool,
        abi: SEALED_POOL_ABI,
        functionName: "submitSealedBetWithEncryption",
        args: [market.id, outcome, viewerKey, stakeWei],
      });
      onSubmitted?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!address) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">Place a bet</h2>
        <p className="text-sm text-muted">Connect your wallet to bet.</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Place a bet</h2>

      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: Number(market.outcomeCount) }, (_, i) => {
          const isYes = market.outcomeCount === 2n && i === 1;
          const isNo = market.outcomeCount === 2n && i === 0;
          const isSelected = outcome === BigInt(i);
          const label = isYes ? "YES" : isNo ? "NO" : `Outcome ${i}`;
          return (
            <button
              key={i}
              onClick={() => setOutcome(BigInt(i))}
              className={`btn ${
                isSelected
                  ? isYes
                    ? "bg-success text-white"
                    : isNo
                    ? "bg-danger text-white"
                    : "bg-accent text-white"
                  : "btn-outline"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">Stake (USDC.e)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input w-full"
        />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={confidential}
          onChange={(e) => setConfidential(e.target.checked)}
        />
        <span>
          Confidential mode (encrypts amount too via cnfUSDC.e){" "}
          <span className="text-muted">— alpha</span>
        </span>
      </label>

      <div>
        <label className="block text-xs text-muted mb-1">Viewer key</label>
        {viewerKey ? (
          <div className="text-xs font-mono text-muted truncate">
            {viewerKey.x.slice(0, 10)}... (saved to browser)
          </div>
        ) : (
          <button onClick={generateViewerKey} className="btn-outline text-sm w-full">
            Generate viewer key
          </button>
        )}
      </div>

      {needsApproval ? (
        <button onClick={handleApprove} disabled={isPending} className="btn-primary w-full">
          {isPending ? "Approving..." : "Approve USDC.e"}
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={isPending || !viewerKey || stakeWei === 0n}
          className="btn-primary w-full"
        >
          {isPending ? "Submitting..." : "Place sealed bet"}
        </button>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <p className="text-xs text-muted">
        Your bet direction is encrypted on chain via SKALE BITE Phase 3. Aggregate odds update once at least 2 new bets exist (privacy threshold).
      </p>
    </div>
  );
}
