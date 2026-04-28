"use client";

import Link from "next/link";

import { MarketStatusLabel } from "../lib/contracts";
import { type MarketData, useAggregatePerOutcome, impliedProbability } from "../lib/markets";

export function MarketCard({ market }: { market: MarketData }) {
  const { aggregates, total } = useAggregatePerOutcome(market.id, market.outcomeCount);
  const yesProbability = market.outcomeCount === 2n ? impliedProbability(aggregates[1] ?? 0n, total) : 0;

  const deadlineMs = Number(market.submissionDeadline) * 1000;
  const remainingMs = deadlineMs - Date.now();
  const remaining = humanizeDuration(remainingMs);

  return (
    <Link href={`/markets/${market.id}`} className="card block">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-muted">
          #{market.id.toString()} · {MarketStatusLabel[market.status]}
        </span>
        {remainingMs > 0 ? (
          <span className="text-xs text-muted">{remaining}</span>
        ) : (
          <span className="text-xs text-danger">closed</span>
        )}
      </div>
      <h3 className="text-base font-semibold mb-4 line-clamp-2 min-h-[3rem]">
        {market.question}
      </h3>
      {market.outcomeCount === 2n ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-success">YES</span>
            <span className="font-mono">{yesProbability.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-bg overflow-hidden">
            <div
              className="h-full bg-success"
              style={{ width: `${Math.min(100, yesProbability)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted">
          {market.outcomeCount.toString()} outcomes
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>{market.numBets.toString()} bet{market.numBets === 1n ? "" : "s"}</span>
        <span>
          public TVL: {formatUsdc(total)} USDC.e
        </span>
      </div>
    </Link>
  );
}

function humanizeDuration(ms: number): string {
  if (ms <= 0) return "ended";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h left`;
  const d = Math.floor(h / 24);
  return `${d}d left`;
}

function formatUsdc(amount: bigint): string {
  return (Number(amount) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
