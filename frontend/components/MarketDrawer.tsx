"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowUpRight, X, Lock } from "@phosphor-icons/react";

import { ADDRESSES, EXPLORER_URL, MarketStatus, MarketStatusLabel } from "../lib/contracts";
import { useMarket } from "../lib/markets";

import { BetForm } from "./BetForm";
import { OddsBreakdown } from "./OddsBreakdown";

interface Props {
  marketId: bigint | null;
  onClose: () => void;
}

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
            className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 220, damping: 30 }}
            className="fixed right-0 top-0 z-40 flex h-[100dvh] w-full max-w-[560px] flex-col border-l border-white/[0.06] bg-ink-900"
          >
            <div className="flex items-start justify-between border-b border-white/[0.06] px-6 py-5">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-500">
                    market #{(marketId ?? 0n).toString().padStart(3, "0")}
                  </span>
                  {market && (
                    <>
                      <span className="text-ink-600">·</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
                        {MarketStatusLabel[market.status]}
                      </span>
                    </>
                  )}
                </div>
                <h2 className="mt-2 text-balance text-[20px] leading-snug tracking-tight text-ink-100">
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
                  <MarketMeta market={market} />

                  <section>
                    <div className="label-eyebrow mb-3">Aggregate odds</div>
                    <OddsBreakdown
                      marketId={market.id}
                      outcomeCount={market.outcomeCount}
                      refreshKey={refreshKey}
                    />
                  </section>

                  <div className="divider" />

                  <section>
                    <div className="label-eyebrow mb-3">Place bet</div>
                    <BetForm
                      market={market}
                      onSubmitted={() => setRefreshKey((k) => k + 1)}
                    />
                  </section>

                  <div className="divider" />

                  <ContractFooter />
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

function MarketMeta({ market }: { market: ReturnType<typeof useMarket>["data"] }) {
  if (!market) return null;
  const closes = new Date(Number(market.submissionDeadline) * 1000);
  const resolves = new Date(Number(market.resolutionTime) * 1000);
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
      <Metric label="Submissions close" value={closes.toLocaleString()} />
      <Metric label="Earliest resolution" value={resolves.toLocaleString()} />
      <Metric
        label="Public stake"
        value={
          <span className="num">
            {(Number(market.totalStake) / 1_000_000).toFixed(2)}{" "}
            <span className="text-ink-500">USDC.e</span>
          </span>
        }
      />
      <Metric
        label="Bets sealed"
        value={
          <span className="num inline-flex items-center gap-1.5">
            <Lock weight="duotone" className="h-3 w-3 text-signal" />
            {market.numBets.toString()}
          </span>
        }
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1 text-ink-100">{value}</div>
    </div>
  );
}

function ContractFooter() {
  return (
    <div className="space-y-3 text-[11px] text-ink-500">
      <div className="label-eyebrow">On-chain references</div>
      <div className="space-y-1.5">
        <ExternalRow label="SealedPool" address={ADDRESSES.SealedPool} />
        <ExternalRow label="cnfUSDC.e wrapper" address={ADDRESSES.ConfidentialWrapper_cUSDC} />
        <ExternalRow label="USDC.e (bridged)" address={ADDRESSES.USDC_e} />
      </div>
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
