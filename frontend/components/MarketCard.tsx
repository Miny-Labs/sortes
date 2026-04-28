"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Lock, Timer, ArrowRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { MarketStatus, MarketStatusLabel } from "../lib/contracts";
import type { MarketData } from "../lib/markets";
import { useAggregatePerOutcome, impliedProbability } from "../lib/markets";

export function MarketCard({
  market,
  size = "md",
  onOpen,
}: {
  market: MarketData;
  size?: "lg" | "md" | "sm";
  onOpen: (id: bigint) => void;
}) {
  const { aggregates, total } = useAggregatePerOutcome(market.id, market.outcomeCount);

  // Cursor position normalized to (-0.5, 0.5). Drives the spotlight position
  // and the 3D tilt simultaneously.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spx = useSpring(px, { stiffness: 200, damping: 24 });
  const spy = useSpring(py, { stiffness: 200, damping: 24 });

  // Spotlight: a brand-tinted glow that follows the cursor.
  const spotlight = useTransform(
    [spx, spy],
    ([x, y]) => {
      const cx = ((x as number) + 0.5) * 100;
      const cy = ((y as number) + 0.5) * 100;
      return `radial-gradient(520px circle at ${cx}% ${cy}%, oklch(0.74 0.17 295 / 0.14), transparent 48%)`;
    },
  );

  // 3D tilt: ±5° rotation that follows the cursor. Subtle enough not to feel
  // gimmicky; strong enough to read as alive.
  const rotateX = useTransform(spy, (v) => `${(v as number) * -6}deg`);
  const rotateY = useTransform(spx, (v) => `${(v as number) * 6}deg`);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const onMouseLeave = () => {
    px.set(0);
    py.set(0);
  };

  const isBinary = market.outcomeCount === 2n;
  const yesProb = isBinary && total > 0n ? impliedProbability(aggregates[1] ?? 0n, total) : 0;
  const closesIn = useCountdown(Number(market.submissionDeadline) * 1000);
  const isOpen = market.status === MarketStatus.Open;

  const titleClass =
    size === "lg"
      ? "text-[28px] md:text-[32px] tracking-tightest leading-[1.05]"
      : size === "sm"
      ? "text-[15px] tracking-tight leading-snug"
      : "text-[18px] tracking-tight leading-snug";

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Open market: ${market.question}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={() => onOpen(market.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(market.id);
        }
      }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1200,
        transformStyle: "preserve-3d",
      }}
      className={`group relative flex h-full cursor-pointer flex-col justify-between overflow-hidden rounded-[20px] border border-white/[0.06] bg-white/[0.015] p-6 transition-[border-color,box-shadow] duration-300 hover:border-signal/40 hover:shadow-[0_30px_60px_-30px_oklch(0.74_0.17_295/0.35)] focus-visible:border-signal/60 ${
        size === "lg" ? "p-8 md:p-10" : ""
      }`}
    >
      <motion.div
        aria-hidden
        style={{ background: spotlight }}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-500">
            #{market.id.toString().padStart(3, "0")}
          </span>
          <StatusDot status={market.status} />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
            {MarketStatusLabel[market.status]}
          </span>
        </div>
        <ArrowRight
          weight="bold"
          className="h-4 w-4 -translate-x-1 text-ink-500 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-ink-200 group-hover:opacity-100"
        />
      </div>

      <h3
        className={`relative mt-6 max-w-[34ch] text-balance font-medium text-ink-100 ${titleClass}`}
      >
        {market.question}
      </h3>

      <div className="relative mt-6">
        {isBinary ? (
          <BinaryBar yes={yesProb} aggregateRevealed={total > 0n} />
        ) : (
          <NaryBars aggregates={aggregates} total={total} />
        )}
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-4 border-t border-white/[0.04] pt-4">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <Lock weight="duotone" className="h-3 w-3 text-signal" />
          <span>sealed direction</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums text-ink-400">
          <span>
            {(Number(market.totalStake) / 1_000_000).toFixed(2)}{" "}
            <span className="text-ink-500">USDC.e</span>
          </span>
          <span>{market.numBets.toString()} bets</span>
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {isOpen ? closesIn : "—"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function BinaryBar({ yes, aggregateRevealed }: { yes: number; aggregateRevealed: boolean }) {
  const no = aggregateRevealed ? 100 - yes : 0;
  const sealed = !aggregateRevealed;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums">
        <div className="flex items-center gap-2">
          <span className="text-signal">YES</span>
          <span className="text-ink-200">
            {sealed ? "—" : yes.toFixed(1)}
            {!sealed && <span className="text-ink-500">%</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink-200">
            {sealed ? "—" : no.toFixed(1)}
            {!sealed && <span className="text-ink-500">%</span>}
          </span>
          <span className="text-warn">NO</span>
        </div>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        {sealed ? (
          <div className="absolute inset-0 animate-pulse-soft bg-gradient-to-r from-white/[0.04] via-white/[0.10] to-white/[0.04]" />
        ) : (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-signal/80"
              style={{ width: `${yes}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-warn/70"
              style={{ width: `${no}%` }}
            />
          </>
        )}
      </div>
      {sealed && (
        <div className="text-[10px] text-ink-500">
          aggregate reveals after the next batch settles
        </div>
      )}
    </div>
  );
}

function NaryBars({ aggregates, total }: { aggregates: bigint[]; total: bigint }) {
  const sealed = total === 0n;
  return (
    <div className="space-y-2">
      {aggregates.map((agg, i) => {
        const pct = sealed ? 0 : impliedProbability(agg, total);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-baseline justify-between font-mono text-[10px] tabular-nums">
              <span className="text-ink-400">outcome {i}</span>
              <span className="text-ink-200">{sealed ? "—" : `${pct.toFixed(1)}%`}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full bg-ink-200/70"
                style={{ width: `${pct}%`, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: MarketStatus }) {
  if (status === MarketStatus.Open) {
    return (
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full bg-signal animate-pulse-soft" />
      </span>
    );
  }
  if (status === MarketStatus.Resolved) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-300" />;
  }
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-600" />;
}

function useCountdown(targetMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = targetMs - now;
  if (ms <= 0) return "closed";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
