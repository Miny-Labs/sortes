"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Lock, Eye, ShieldCheck } from "@phosphor-icons/react";

import { MarketCard } from "../components/MarketCard";
import { MarketDrawer } from "../components/MarketDrawer";
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
      <Hero totals={totals} />

      <div className="mx-auto max-w-[1400px] px-6">
        <div className="divider" />
      </div>

      <section className="relative mx-auto max-w-[1400px] px-6 pb-32 pt-20 lg:pt-24">
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
  return (
    <section className="relative mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-6 pb-12 pt-16 lg:grid-cols-[1.4fr_1fr] lg:pb-20 lg:pt-24">
      <div className="relative">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="label-eyebrow"
        >
          Sortes · sealed prediction markets
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 max-w-[18ch] text-balance font-display text-[44px] font-medium leading-[0.95] tracking-tightest text-ink-100 md:text-[64px]"
        >
          Public liquidity. <span className="text-ink-400">Sealed</span> direction.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 max-w-[52ch] text-pretty text-[15px] leading-relaxed text-ink-400"
        >
          A prediction market that hides which side you took until enough other bettors take a side
          with you. Encrypted on-chain via SKALE BITE Phase&nbsp;3, settled in batched aggregates,
          paid out pari-mutuel from a unified pot.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 flex flex-wrap items-center gap-2"
        >
          <Capsule icon={<Lock weight="duotone" className="h-3.5 w-3.5 text-signal" />}>
            sealed direction
          </Capsule>
          <Capsule icon={<Eye weight="duotone" className="h-3.5 w-3.5 text-ink-300" />}>
            aggregate-only odds, N≥2
          </Capsule>
          <Capsule icon={<ShieldCheck weight="duotone" className="h-3.5 w-3.5 text-ink-300" />}>
            unified TVL, public + confidential
          </Capsule>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-10 flex items-center gap-3 text-[11px] text-ink-500"
        >
          <a
            href={`${EXPLORER_URL}/address/${ADDRESSES.SealedPool}`}
            target="_blank"
            rel="noreferrer"
            className="num inline-flex items-center gap-1 underline-offset-4 hover:text-ink-200 hover:underline"
          >
            SealedPool {ADDRESSES.SealedPool.slice(0, 8)}…{ADDRESSES.SealedPool.slice(-4)}
            <ArrowUpRight className="h-3 w-3" />
          </a>
          <span className="text-ink-700">·</span>
          <span className="num">SKALE Base Sepolia</span>
          <span className="text-ink-700">·</span>
          <span className="num">v4 unified-TVL + confidential bets</span>
        </motion.div>
      </div>

      <StatsCard totals={totals} />
    </section>
  );
}

function Capsule({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <span className="pill cursor-default">
      {icon}
      <span>{children}</span>
    </span>
  );
}

// Stats column. Drops the 3-equal-stat hero-metric template and the radial
// glow accent in favor of a quiet ledger of term/value rows separated by
// hairlines. The Privacy stack lands directly below as a second ledger,
// without nesting cards.
function StatsCard({ totals }: { totals: { stake: bigint; bets: bigint; open: number } }) {
  const stake = (Number(totals.stake) / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="self-start space-y-10"
    >
      <div>
        <div className="label-eyebrow">Live state</div>
        <dl className="mt-4 divide-y divide-white/[0.05] border-y border-white/[0.05]">
          <LedgerRow term="public stake" value={`${stake} USDC.e`} />
          <LedgerRow term="bets sealed" value={totals.bets.toString()} />
          <LedgerRow term="markets open" value={totals.open.toString()} />
        </dl>
      </div>

      <div>
        <div className="label-eyebrow">Privacy stack</div>
        <ul className="mt-4 space-y-3">
          <Layer name="PHASE 3" body="ECIES re-encrypt of payouts under your viewer key." />
          <Layer name="PHASE 2" body="CTX batch decrypts every direction at resolution." />
          <Layer name="CNFUSDC" body="ERC-20 wrapper. Encrypted balances for amount-privacy." />
          <Layer name="N≥2" body="Aggregate odds publish only after a 2-bet batch." />
        </ul>
      </div>
    </motion.div>
  );
}

function LedgerRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5">
      <dt className="text-[13px] text-ink-300">{term}</dt>
      <dd className="num text-[15px] font-medium text-ink-100">{value}</dd>
    </div>
  );
}

function Layer({ name, body }: { name: string; body: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="num shrink-0 text-[10px] uppercase tracking-[0.18em] text-signal">
        {name}
      </span>
      <span className="text-ink-300">{body}</span>
    </li>
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
