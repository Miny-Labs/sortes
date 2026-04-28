// Hooks + helpers for reading market data via wagmi.
"use client";

import { useReadContract, useReadContracts } from "wagmi";

import { ADDRESSES, MarketStatus, SEALED_POOL_ABI } from "./contracts";

export interface MarketData {
  id: bigint;
  question: string;
  outcomeCount: bigint;
  submissionDeadline: bigint;
  resolutionTime: bigint;
  collateral: `0x${string}`;
  status: MarketStatus;
  oracleOutcome: bigint;
  oracleReported: boolean;
  totalStake: bigint;
  winningStake: bigint;
  numBets: bigint;
}

export function useMarketCount() {
  return useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "marketCount",
  });
}

export function useMarket(marketId: bigint | undefined): {
  data: MarketData | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const { data, isLoading, refetch } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "marketInfo",
    args: marketId !== undefined ? [marketId] : undefined,
    query: { enabled: marketId !== undefined && marketId > 0n },
  });
  const arr = data as
    | readonly [string, bigint, bigint, bigint, `0x${string}`, number, bigint, boolean, bigint, bigint, bigint]
    | undefined;
  return {
    data: arr && marketId
      ? {
          id: marketId,
          question: arr[0],
          outcomeCount: arr[1],
          submissionDeadline: arr[2],
          resolutionTime: arr[3],
          collateral: arr[4],
          status: arr[5] as MarketStatus,
          oracleOutcome: arr[6],
          oracleReported: arr[7],
          totalStake: arr[8],
          winningStake: arr[9],
          numBets: arr[10],
        }
      : undefined,
    isLoading,
    refetch,
  };
}

export function useAllMarkets(count: bigint | undefined): { markets: MarketData[]; isLoading: boolean } {
  const ids: bigint[] = count ? Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1)) : [];
  const { data, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({
      address: ADDRESSES.SealedPool,
      abi: SEALED_POOL_ABI,
      functionName: "marketInfo",
      args: [id],
    })),
    query: { enabled: ids.length > 0 },
  });
  const markets: MarketData[] =
    data?.flatMap((r, i) => {
      if (r.status !== "success") return [];
      const arr = r.result as readonly [string, bigint, bigint, bigint, `0x${string}`, number, bigint, boolean, bigint, bigint, bigint];
      return [{
        id: ids[i],
        question: arr[0],
        outcomeCount: arr[1],
        submissionDeadline: arr[2],
        resolutionTime: arr[3],
        collateral: arr[4],
        status: arr[5] as MarketStatus,
        oracleOutcome: arr[6],
        oracleReported: arr[7],
        totalStake: arr[8],
        winningStake: arr[9],
        numBets: arr[10],
      }];
    }) ?? [];
  return { markets, isLoading };
}

export function useAggregatePerOutcome(marketId: bigint | undefined, outcomeCount: bigint | undefined) {
  const outcomes: bigint[] = outcomeCount ? Array.from({ length: Number(outcomeCount) }, (_, i) => BigInt(i)) : [];
  const { data, isLoading } = useReadContracts({
    contracts: outcomes.map((o) => ({
      address: ADDRESSES.SealedPool,
      abi: SEALED_POOL_ABI,
      functionName: "aggregatePerOutcome",
      args: marketId !== undefined ? [marketId, o] : undefined,
    })),
    query: { enabled: marketId !== undefined && outcomes.length > 0 },
  });
  const aggregates =
    data?.map((r) => (r.status === "success" ? (r.result as bigint) : 0n)) ?? outcomes.map(() => 0n);
  const total = aggregates.reduce((a, b) => a + b, 0n);
  return { aggregates, total, isLoading };
}

export function impliedProbability(stake: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((stake * 10000n) / total) / 100;
}
