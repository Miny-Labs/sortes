"use client";

import { useEffect } from "react";
import { useReadContract, useWriteContract } from "wagmi";

import { ADDRESSES, SEALED_POOL_ABI } from "../lib/contracts";
import { useAggregatePerOutcome } from "../lib/markets";

interface Props {
  marketId: bigint;
  outcomeCount: bigint;
  refreshKey?: number;
}

export function OddsBreakdown({ marketId, outcomeCount, refreshKey }: Props) {
  const { aggregates, total } = useAggregatePerOutcome(marketId, outcomeCount);

  // Total bets vs aggregated bets — show "N pending reveal" when N >= 2.
  const { data: totalBets, refetch: refetchBets } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "betCountOf",
    args: [marketId],
  });
  const { data: aggregated, refetch: refetchAgg } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "aggregatedUpToIndex",
    args: [marketId],
  });

  useEffect(() => {
    refetchBets();
    refetchAgg();
  }, [refreshKey, refetchBets, refetchAgg]);

  const pending = (totalBets as bigint | undefined) && (aggregated as bigint | undefined)
    ? (totalBets as bigint) - (aggregated as bigint)
    : 0n;

  const { writeContract, isPending: revealing } = useWriteContract();
  const triggerReveal = () =>
    writeContract({
      address: ADDRESSES.SealedPool,
      abi: SEALED_POOL_ABI,
      functionName: "triggerAggregateReveal",
      args: [marketId],
    });

  if (total === 0n && pending === 0n) {
    return <p className="text-muted text-sm">No bets yet. Be first.</p>;
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: Number(outcomeCount) }, (_, i) => {
        const stake = aggregates[i] ?? 0n;
        const pct = total > 0n ? Number((stake * 10000n) / total) / 100 : 0;
        const label = outcomeCount === 2n ? (i === 1 ? "YES" : "NO") : `Outcome ${i}`;
        const color = outcomeCount === 2n ? (i === 1 ? "bg-success" : "bg-danger") : "bg-accent";
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className={i === 1 && outcomeCount === 2n ? "text-success" : i === 0 && outcomeCount === 2n ? "text-danger" : ""}>
                {label}
              </span>
              <span className="font-mono">{pct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-bg overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="text-xs text-muted mt-1 font-mono">
              {(Number(stake) / 1_000_000).toFixed(2)} USDC.e
            </div>
          </div>
        );
      })}
      {pending >= 2n && (
        <div className="border-t border-border pt-3 mt-3">
          <p className="text-xs text-muted mb-2">
            {pending.toString()} new bets pending aggregate reveal (N≥2 anonymity threshold).
          </p>
          <button onClick={triggerReveal} disabled={revealing} className="btn-outline text-sm w-full">
            {revealing ? "Revealing..." : "Trigger aggregate reveal"}
          </button>
        </div>
      )}
      {pending === 1n && (
        <p className="text-xs text-muted border-t border-border pt-3">
          1 bet pending. Need at least 2 new bets before aggregate can be revealed (privacy threshold).
        </p>
      )}
    </div>
  );
}
