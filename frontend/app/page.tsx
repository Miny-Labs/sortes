"use client";

import Link from "next/link";

import { MarketCard } from "../components/MarketCard";
import { useAllMarkets, useMarketCount } from "../lib/markets";

export default function HomePage() {
  const { data: count } = useMarketCount();
  const { markets, isLoading } = useAllMarkets(count as bigint | undefined);

  return (
    <div>
      <section className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          Privacy-first prediction markets
        </h1>
        <p className="text-muted text-lg max-w-2xl">
          Polymarket UX, with bet directions encrypted on chain via SKALE BITE.
          Choose between public bets (USDC.e collateral, composable everywhere) or
          confidential bets (cnfUSDC.e, encrypted amount and direction).
          Same pot, you pick your privacy.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Open markets</h2>
          <Link href="/admin" className="text-sm text-muted hover:text-accent">
            + create market (admin)
          </Link>
        </div>
        {isLoading && <p className="text-muted">Loading markets...</p>}
        {!isLoading && markets.length === 0 && (
          <div className="card text-center text-muted py-10">
            No markets yet. Admin can create one.
          </div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((m) => (
            <MarketCard key={m.id.toString()} market={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
