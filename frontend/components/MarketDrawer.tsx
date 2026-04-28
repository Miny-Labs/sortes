"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowUpRight, X, Lock, CaretDown } from "@phosphor-icons/react";

import { ADDRESSES, EXPLORER_URL, MarketStatus } from "../lib/contracts";
import { useMarket } from "../lib/markets";

import { BetForm } from "./BetForm";
import { OddsBreakdown } from "./OddsBreakdown";

interface Props {
  marketId: bigint | null;
  onClose: () => void;
}

// Friendlier status labels than what the contract returns. The MarketStatusLabel
// in lib/contracts is for protocol consumers ("AwaitingDecryption", "Triggered");
// these are for humans.
const STATUS_LABEL: Record<MarketStatus, string> = {
  [MarketStatus.None]: "—",
  [MarketStatus.Open]: "Open",
  [MarketStatus.AwaitingOracle]: "Closed · waiting on outcome",
  [MarketStatus.AwaitingDecryption]: "Resolving",
  [MarketStatus.Triggered]: "Resolving",
  [MarketStatus.Resolved]: "Resolved",
  [MarketStatus.Cancelled]: "Cancelled",
};

export function MarketDrawer({ marketId, onClose }: Props) {
  const open = marketId !== null;
  const { data: market } = useMarket(marketId ?? undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 220, damping: 30 }}
            className="fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-[720px] flex-col border-l border-white/[0.06] bg-ink-900"
          >
            <div className="flex items-start justify-between border-b border-white/[0.06] px-6 py-5">
              <div className="min-w-0 flex-1 pr-4">
                {market && <StatusChip status={market.status} />}
                <h2 className="mt-3 text-balance font-display text-[22px] leading-snug tracking-tight text-ink-100">
                  {market?.question ?? "—"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-white/[0.04] hover:text-ink-100"
                aria-label="Close"
              >
                <X weight="bold" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {market ? (
                <div className="space-y-8 px-6 py-6">
                  <MarketSummary market={market} />

                  <section>
                    <div className="label-eyebrow mb-3">Current odds</div>
                    <OddsBreakdown
                      marketId={market.id}
                      outcomeCount={market.outcomeCount}
                      refreshKey={refreshKey}
                    />
                  </section>

                  <div className="divider" />

                  <section>
                    <div className="label-eyebrow mb-3">Place a bet</div>
                    <BetForm
                      market={market}
                      onSubmitted={() => setRefreshKey((k) => k + 1)}
                    />
                  </section>

                  <BetLifecycle market={market} />

                  <DetailsAccordion />
                </div>
              ) : (
                <DrawerSkeleton />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function StatusChip({ status }: { status: MarketStatus }) {
  const open = status === MarketStatus.Open;
  const resolved = status === MarketStatus.Resolved;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] tracking-tight text-ink-300">
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          className={`absolute inset-0 rounded-full ${
            open
              ? "bg-signal animate-pulse-soft"
              : resolved
              ? "bg-ink-300"
              : "bg-ink-600"
          }`}
        />
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

function MarketSummary({ market }: { market: ReturnType<typeof useMarket>["data"] }) {
  if (!market) return null;
  const closes = Number(market.submissionDeadline) * 1000;
  const closesIn = useReadableCountdown(closes);
  const stake = (Number(market.totalStake) / 1_000_000).toFixed(2);

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
      <SummaryItem
        label="Closes in"
        value={market.status === MarketStatus.Open ? closesIn : "Closed"}
      />
      <SummaryItem
        label="Total at stake"
        value={
          <span className="num">
            {stake} <span className="text-ink-500">USDC.e</span>
          </span>
        }
      />
      <SummaryItem
        label="Bets placed"
        value={
          <span className="num inline-flex items-center gap-1.5">
            <Lock weight="duotone" className="h-3 w-3 text-signal" />
            {market.numBets.toString()}
          </span>
        }
      />
      <SummaryItem
        label="Resolves around"
        value={new Date(Number(market.resolutionTime) * 1000).toLocaleDateString(
          undefined,
          { month: "short", day: "numeric" },
        )}
      />
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 text-ink-100">{value}</div>
    </div>
  );
}

// Market-specific lifecycle. Differs from the landing's HowItWorks panel —
// where that one is a generic "what is this product" explainer, this one
// shows the actual schedule for the market the user is looking at.
function BetLifecycle({ market }: { market: ReturnType<typeof useMarket>["data"] }) {
  if (!market) return null;
  const closes = new Date(Number(market.submissionDeadline) * 1000);
  const resolves = new Date(Number(market.resolutionTime) * 1000);
  const closesLabel = closes.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const resolvesLabel = resolves.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const steps: Array<{ when: string; what: string; sub?: string }> = [
    { when: "Now", what: "You bet", sub: "Your pick is sealed the moment you submit." },
    {
      when: "After two new bets",
      what: "Odds update",
      sub: "The order book refreshes in batches — never one bet at a time.",
    },
    { when: closesLabel, what: "Submissions close" },
    {
      when: `≈ ${resolvesLabel}`,
      what: "Outcome reported",
      sub: "Once the result is in, payouts are computed for everyone in one batch.",
    },
    {
      when: "Anytime after",
      what: "Redeem",
      sub: "Tap redeem from your wallet drawer; payout decrypts in this browser.",
    },
  ];

  return (
    <section>
      <div className="label-eyebrow mb-4">What happens next</div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[110px_1fr] gap-4">
            <div className="num pt-0.5 text-[11px] uppercase tracking-[0.14em] text-ink-500">
              {s.when}
            </div>
            <div className="border-l border-white/[0.06] pl-4">
              <div className="text-[13.5px] text-ink-100">{s.what}</div>
              {s.sub && (
                <div className="mt-1 text-[12px] leading-relaxed text-ink-400">
                  {s.sub}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Collapsible "for the curious" section with the contract addresses. Hidden
// by default so regular users don't get a wall of hex.
function DetailsAccordion() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/[0.05] pt-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-500 transition-colors hover:text-ink-300"
        aria-expanded={open}
      >
        <CaretDown
          weight="bold"
          className={`h-3 w-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
        for the curious — contracts
      </button>
      {open && (
        <div className="mt-4 space-y-1.5 text-[11px] text-ink-500">
          <ExternalRow label="Market pool" address={ADDRESSES.SealedPool} />
          <ExternalRow label="USDC.e (bridged)" address={ADDRESSES.USDC_e} />
          <ExternalRow
            label="cnfUSDC.e (private wrapper)"
            address={ADDRESSES.ConfidentialWrapper_cUSDC}
          />
        </div>
      )}
    </div>
  );
}

function ExternalRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-400">{label}</span>
      <a
        href={`${EXPLORER_URL}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        className="num inline-flex items-center gap-1 text-ink-300 underline-offset-2 hover:text-ink-100 hover:underline"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
        <ArrowUpRight className="h-3 w-3 opacity-60" />
      </a>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-6 px-6 py-6">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 rounded-xl bg-gradient-to-r from-white/[0.02] via-white/[0.05] to-white/[0.02] animate-shimmer"
          style={{ backgroundSize: "200% 100%" }}
        />
      ))}
    </div>
  );
}

// Inline countdown helper. "5d 3h", "2h 14m", "in 12 minutes". No raw
// timestamps in the user-facing view.
function useReadableCountdown(targetMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = targetMs - now;
  if (ms <= 0) return "Closed";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
