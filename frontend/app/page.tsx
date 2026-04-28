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

  const openCount = sorted.filter((m) => m.status === MarketStatus.Open).length;

  return (
    <>
      <Hero />

      <HowItWorks />

      <div className="mx-auto max-w-[1400px] px-6">
        <div className="divider" />
      </div>

      <section
        data-section="markets"
        className="relative mx-auto max-w-[1400px] px-6 pb-20 pt-20 lg:pb-24 lg:pt-24"
      >
        <div className="mb-12 flex flex-wrap items-end justify-between gap-y-4">
          <div>
            <div className="label-eyebrow">Open book</div>
            <h2 className="mt-3 font-display text-[40px] font-medium leading-none tracking-tightest text-ink-100 md:text-[52px]">
              Markets
            </h2>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-ink-400">
            {sorted.length} total · <span className="text-ink-200">{openCount}</span> open
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

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4";
const PRIVACY_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_183428_ab5e672a-f608-4dcb-b319-f3e040f02e2d.mp4";

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Ambient video, heavily darkened so the wordmark stays dominant. */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18]"
      >
        <source src={HERO_VIDEO} type="video/mp4" />
      </video>
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_30%,transparent_0%,oklch(0.105_0.003_295/0.55)_55%,oklch(0.105_0.003_295)_100%)]"
      />

      <div className="relative mx-auto max-w-[1400px] px-6 pb-12 pt-16 lg:pb-20 lg:pt-24">
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="font-display font-medium leading-[0.85] tracking-tightest text-ink-100"
          style={{ fontSize: "clamp(5rem, 18vw, 16rem)" }}
        >
          sortes
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 lg:mt-14"
        >
          <QuickStart />
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-6 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.06]"
      >
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
        >
          <source src={PRIVACY_VIDEO} type="video/mp4" />
        </video>
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/60 to-ink-950/20"
        />

        <div className="relative grid gap-8 px-8 py-12 md:grid-cols-[1.1fr_1fr] md:gap-12 md:px-12 md:py-16 lg:px-16 lg:py-20">
          <div>
            <div className="label-eyebrow">how it works</div>
            <h3
              className="mt-3 max-w-[16ch] text-balance font-display font-medium leading-[0.95] tracking-tightest text-ink-100"
              style={{ fontSize: "clamp(1.75rem, 3.6vw, 3.25rem)" }}
            >
              Bet without telling anyone which side you took.
            </h3>
          </div>
          <div className="self-end">
            <p className="max-w-[40ch] text-[14px] leading-relaxed text-ink-300 md:text-[15px]">
              Your pick stays encrypted on chain. Odds only update once at least
              two new bets land — so a single trade never reveals you. Stake and
              choice are unsealed only at settlement.
            </p>
          </div>
        </div>
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
