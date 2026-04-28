"use client";

import { useEffect } from "react";
import { useReadContract, useWriteContract } from "wagmi";
import { motion } from "framer-motion";
import { Eye, Lock } from "@phosphor-icons/react";

import { ADDRESSES, SEALED_POOL_ABI } from "../lib/contracts";
import { useAggregatePerOutcome } from "../lib/markets";

interface Props {
  marketId: bigint;
  outcomeCount: bigint;
  refreshKey?: number;
}

export function OddsBreakdown({ marketId, outcomeCount, refreshKey }: Props) {
  const { aggregates, total } = useAggregatePerOutcome(marketId, outcomeCount);

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

  const pending =
    (totalBets as bigint | undefined) && (aggregated as bigint | undefined)
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
    return (
      <div className="flex items-center gap-2 text-[12px] text-ink-500">
        <Lock className="h-3.5 w-3.5" />
        no bets yet. odds appear after the first batch settles.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {Array.from({ length: Number(outcomeCount) }, (_, i) => {
          const stake = aggregates[i] ?? 0n;
          const pct = total > 0n ? Number((stake * 10000n) / total) / 100 : 0;
          const isYes = outcomeCount === 2n && i === 1;
          const isNo = outcomeCount === 2n && i === 0;
          const label = isYes ? "YES" : isNo ? "NO" : `outcome ${i}`;
          const labelColor = isYes ? "text-signal" : isNo ? "text-warn" : "text-ink-200";
          const barColor = isYes ? "bg-signal/80" : isNo ? "bg-warn/80" : "bg-ink-200/70";

          return (
            <div key={i}>
              <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums">
                <span className={labelColor}>{label}</span>
                <div className="flex items-baseline gap-3 text-ink-300">
                  <span className="text-ink-500">
                    {(Number(stake) / 1_000_000).toFixed(2)} USDC.e
                  </span>
                  <span className="num text-[13px] font-medium text-ink-100">
                    {pct.toFixed(1)}
                    <span className="text-ink-500">%</span>
                  </span>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                <motion.div
                  className={`h-full ${barColor}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 90, damping: 20 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {pending >= 2n && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label-eyebrow">aggregate disclosure</div>
              <div className="mt-1 text-[12px] text-ink-300">
                <span className="num text-ink-100">{pending.toString()}</span> new bets queued.
                Threshold met (N≥2). You can publish the next aggregate.
              </div>
            </div>
            <button
              onClick={triggerReveal}
              disabled={revealing}
              className="btn-ghost whitespace-nowrap text-xs"
            >
              <Eye weight="duotone" className="h-3.5 w-3.5" />
              {revealing ? "Revealing…" : "Reveal"}
            </button>
          </div>
        </div>
      )}
      {pending === 1n && (
        <div className="rounded-xl border border-dashed border-white/[0.08] p-3 text-[11px] text-ink-500">
          <span className="num text-ink-300">1</span> bet queued. The protocol holds reveals until
          at least 2 new bets accumulate (anti-deanonymization threshold).
        </div>
      )}
    </div>
  );
}
