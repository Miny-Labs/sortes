"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "@phosphor-icons/react";

import { MarketCard } from "../components/MarketCard";
import { MarketDrawer } from "../components/MarketDrawer";
import { QuickStart } from "../components/QuickStart";
import { ADDRESSES, EXPLORER_URL } from "../lib/contracts";
import { MarketStatus } from "../lib/contracts";
import { useAllMarkets, useMarketCount } from "../lib/markets";
import type { MarketData } from "../lib/markets";

export default function HomePage() {
  const { data: count } = useMarketCount();
  const { markets, isLoading } = useAllMarkets(count as bigint | undefined);
  const [openId, setOpenId] = useState<bigint | null>(null);

  const sorted = useMemo(() => {
    const arr = markets.filter((m) => m.status !== MarketStatus.Cancelled);
    arr.sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === MarketStatus.Open) return -1;
        if (b.status === MarketStatus.Open) return 1;
      }
      return Number(b.totalStake - a.totalStake);
    });
    return arr;
  }, [markets]);

  const totals = useMemo(() => {
    let stake = 0n;
    let bets = 0n;
    let open = 0;
    for (const m of markets) {
      if (m.status === MarketStatus.Cancelled) continue;
      stake += m.totalStake;
      bets += m.numBets;
      if (m.status === MarketStatus.Open) open++;
    }
    return { stake, bets, open };
  }, [markets]);

  return (
    <>
      <QuickStart />

      <Hero totals={totals} />

      <div className="mx-auto max-w-[1400px] px-6">
        <div className="divider" />
      </div>

      <section
        data-section="markets"
        className="relative mx-auto max-w-[1400px] px-6 pb-32 pt-20 lg:pt-24"
      >
        <div className="mb-12 flex flex-wrap items-end justify-between gap-y-4">
          <div>
            <div className="label-eyebrow">Open book</div>
            <h2 className="mt-3 font-display text-[40px] font-medium leading-none tracking-tightest text-ink-100 md:text-[52px]">
              Markets
            </h2>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-ink-400">
            {sorted.length} total · <span className="text-ink-200">{totals.open}</span> open
          </div>
        </div>

        {isLoading && <BentoSkeleton />}

        {!isLoading && sorted.length === 0 && <EmptyMarkets />}

        {!isLoading && sorted.length > 0 && (
          <BentoGrid markets={sorted} onOpen={(id) => setOpenId(id)} />
        )}
      </section>

      <Footer />

      <MarketDrawer marketId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function Hero({ totals }: { totals: { stake: bigint; bets: bigint; open: number } }) {
  const stake = (Number(totals.stake) / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return (
    <section className="relative mx-auto max-w-[1400px] px-6 pb-16 pt-20 lg:pb-24 lg:pt-28">
      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[14ch] text-balance font-display font-medium leading-[0.88] tracking-tightest text-ink-100"
        style={{ fontSize: "clamp(3rem, 9vw, 8rem)" }}
      >
        Public liquidity.{" "}
        <span className="text-ink-500">Sealed</span> direction.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="mt-10 max-w-[42ch] text-[16px] leading-relaxed text-ink-300 md:text-[18px]"
      >
        Sealed-bid prediction markets. Direction encrypted on-chain via SKALE BITE.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.6 }}
        className="mt-14 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[12px] tabular-nums text-ink-400"
      >
        <span>
          <span className="text-[15px] text-ink-100">{totals.open}</span>{" "}
          <span className="text-ink-500">markets open</span>
        </span>
        <span>
          <span className="text-[15px] text-ink-100">{totals.bets.toString()}</span>{" "}
          <span className="text-ink-500">bets sealed</span>
        </span>
        <span>
          <span className="text-[15px] text-ink-100">{stake}</span>{" "}
          <span className="text-ink-500">USDC.e public stake</span>
        </span>
        <a
          href={`${EXPLORER_URL}/address/${ADDRESSES.SealedPool}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-ink-500 underline-offset-4 hover:text-ink-200 hover:underline"
        >
          contract {ADDRESSES.SealedPool.slice(0, 6)}…{ADDRESSES.SealedPool.slice(-4)}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </motion.div>
    </section>
  );
}

// Deterministic asymmetric bento. Featured spans 4/6 and pairs with a
// 2-col card on row 1, then alternating 3+3, 2+4, 4+2 rows fill the rest.
// Designed so no row ever ends up as three equal cards (the templated SaaS
// tile pattern banned by the design context). Pattern wraps for >9 markets.
const BENTO_REST: ReadonlyArray<{ span: string; size: "md" | "sm" }> = [
  { span: "md:col-span-2 lg:col-span-2", size: "sm" }, // row 1 partner of featured
  { span: "md:col-span-2 lg:col-span-3", size: "md" },
  { span: "md:col-span-2 lg:col-span-3", size: "md" },
  { span: "md:col-span-2 lg:col-span-4", size: "md" },
  { span: "md:col-span-1 lg:col-span-2", size: "sm" },
  { span: "md:col-span-1 lg:col-span-2", size: "sm" },
  { span: "md:col-span-2 lg:col-span-4", size: "md" },
  { span: "md:col-span-2 lg:col-span-3", size: "md" },
  { span: "md:col-span-2 lg:col-span-3", size: "md" },
];

function BentoGrid({
  markets,
  onOpen,
}: {
  markets: MarketData[];
  onOpen: (id: bigint) => void;
}) {
  const [featured, ...rest] = markets;
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.04 } },
      }}
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6"
    >
      {featured && (
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          transition={{ type: "spring", stiffness: 110, damping: 22 }}
          className="md:col-span-2 lg:col-span-4"
        >
          <MarketCard market={featured} size="lg" onOpen={onOpen} />
        </motion.div>
      )}
      {rest.map((m, i) => {
        const slot = BENTO_REST[i % BENTO_REST.length];
        return (
          <motion.div
            key={m.id.toString()}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ type: "spring", stiffness: 110, damping: 22 }}
            className={slot.span}
          >
            <MarketCard market={m} size={slot.size} onOpen={onOpen} />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function BentoSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
      {[
        "lg:col-span-4 h-[260px]",
        "lg:col-span-2 h-[260px]",
        "lg:col-span-2 h-[180px]",
        "lg:col-span-2 h-[180px]",
        "lg:col-span-2 h-[180px]",
      ].map((cls, i) => (
        <div
          key={i}
          className={`md:col-span-1 ${cls} animate-shimmer rounded-[20px] bg-gradient-to-r from-white/[0.02] via-white/[0.05] to-white/[0.02]`}
          style={{ backgroundSize: "200% 100%" }}
        />
      ))}
    </div>
  );
}

function EmptyMarkets() {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] p-10 text-center">
      <div className="label-eyebrow">No markets yet</div>
      <p className="mx-auto mt-2 max-w-[40ch] text-pretty text-[13px] leading-relaxed text-ink-400">
        The protocol is deployed and verified. Markets show up here as soon as the operator opens
        them. Operators can post a question from the admin route.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.04]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-6 py-6 text-[11px] text-ink-400 sm:flex-row sm:items-center sm:justify-between">
        <div className="py-2">
          Sortes alpha · SKALE Base Sepolia · BITE Phase 2 + Phase 3 · evm istanbul · solc 0.8.27
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/Miny-Labs/sortes"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-1 rounded-full px-3 hover:text-ink-100"
          >
            github
            <ArrowUpRight className="h-3 w-3" />
          </a>
          <a
            href={`${EXPLORER_URL}/address/${ADDRESSES.SealedPool}`}
            target="_blank"
            rel="noreferrer"
            className="num inline-flex h-11 items-center gap-1 rounded-full px-3 hover:text-ink-100"
          >
            contract
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
