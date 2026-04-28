"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { BetForm } from "../../../components/BetForm";
import { OddsBreakdown } from "../../../components/OddsBreakdown";
import { MarketStatusLabel } from "../../../lib/contracts";
import { useMarket } from "../../../lib/markets";

export default function MarketDetailPage() {
  const params = useParams<{ id: string }>();
  const marketId = params?.id ? BigInt(params.id) : undefined;
  const { data: market, isLoading } = useMarket(marketId);

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  if (isLoading || !market) {
    return <p className="text-muted">Loading market...</p>;
  }

  const deadline = new Date(Number(market.submissionDeadline) * 1000).toLocaleString();
  const resolution = new Date(Number(market.resolutionTime) * 1000).toLocaleString();
  const isOpen = market.status === 1;

  return (
    <div className="grid lg:grid-cols-[2fr_1fr] gap-8">
      <div>
        <div className="text-sm text-muted mb-2">
          Market #{market.id.toString()} · {MarketStatusLabel[market.status]}
        </div>
        <h1 className="text-3xl font-semibold mb-6 leading-tight">{market.question}</h1>

        <div className="card mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">
            Live odds (aggregate disclosure)
          </h2>
          <OddsBreakdown
            marketId={market.id}
            outcomeCount={market.outcomeCount}
            refreshKey={refreshKey}
          />
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">
            Market details
          </h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-muted">Outcome count</dt>
              <dd>{market.outcomeCount.toString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Submission deadline</dt>
              <dd>{deadline}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Resolution time</dt>
              <dd>{resolution}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Total bets</dt>
              <dd>{market.numBets.toString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Public TVL</dt>
              <dd>{(Number(market.totalStake) / 1_000_000).toFixed(2)} USDC.e</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Collateral</dt>
              <dd className="font-mono text-xs truncate ml-4">
                {market.collateral.slice(0, 6)}...{market.collateral.slice(-4)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <aside>
        {isOpen ? (
          <BetForm market={market} onSubmitted={refresh} />
        ) : (
          <div className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">
              Status
            </h2>
            <p className="text-sm">
              This market is {MarketStatusLabel[market.status].toLowerCase()}.
              {market.status === 5 && " Resolved bets can be redeemed from the Portfolio page."}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
