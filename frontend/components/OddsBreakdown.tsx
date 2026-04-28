"use client";

import { useEffect } from "react";
import { useReadContract, useWriteContract } from "wagmi";
import { motion } from "framer-motion";
import { Lock } from "@phosphor-icons/react";

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
  const refresh = () =>
    writeContract({
      address: ADDRESSES.SealedPool,
      abi: SEALED_POOL_ABI,
      functionName: "triggerAggregateReveal",
      args: [marketId],
    });

  if (total === 0n && pending === 0n) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-3 text-[12px] text-ink-400">
        <Lock className="h-3.5 w-3.5 text-signal" />
        Be the first to place a bet — odds appear once a few people have weighed in.
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
          const label = isYes ? "Yes" : isNo ? "No" : `Outcome ${i}`;
          const labelColor = isYes ? "text-signal" : isNo ? "text-warn" : "text-ink-200";
          const barColor = isYes ? "bg-signal/80" : isNo ? "bg-warn/80" : "bg-ink-200/70";

          return (
            <div key={i}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className={labelColor}>{label}</span>
                <span className="num text-[14px] font-medium text-ink-100">
                  {pct.toFixed(0)}
                  <span className="text-ink-500">%</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.04]">
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="text-[12px] text-ink-300">
            <span className="num text-ink-100">{pending.toString()}</span> new bets
            waiting to update the odds.
          </div>
          <button
            onClick={refresh}
            disabled={revealing}
            className="text-[12px] text-signal underline-offset-4 hover:underline disabled:opacity-50"
          >
            {revealing ? "refreshing…" : "refresh →"}
          </button>
        </div>
      )}
      {pending === 1n && (
        <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-[11.5px] text-ink-500">
          One bet placed since the last update. Odds refresh after the next bet — privacy
          needs at least two people to update at a time.
        </div>
      )}
    </div>
  );
}
