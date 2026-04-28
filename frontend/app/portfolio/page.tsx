"use client";

import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";

import { ADDRESSES, MarketStatus, MarketStatusLabel, SEALED_POOL_ABI } from "../../lib/contracts";

export default function PortfolioPage() {
  const { address } = useAccount();
  const { data: count } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "marketCount",
  });

  if (!address) {
    return <p className="text-muted">Connect your wallet to see your bets.</p>;
  }

  const ids: bigint[] = count ? Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1)) : [];

  return (
    <div>
      <h1 className="text-3xl font-semibold mb-2">Your portfolio</h1>
      <p className="text-muted mb-8">
        Bets you've placed across all markets. Encrypted positions are decrypted client-side using your viewer key (stored in this browser).
      </p>
      {ids.length === 0 && <p className="text-muted">No markets yet.</p>}
      <div className="space-y-4">
        {ids.map((id) => (
          <MarketBets key={id.toString()} marketId={id} bettor={address} />
        ))}
      </div>
    </div>
  );
}

function MarketBets({ marketId, bettor }: { marketId: bigint; bettor: `0x${string}` }) {
  const { data: marketInfo } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "marketInfo",
    args: [marketId],
  });
  const { data: betCount } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "betCountOf",
    args: [marketId],
  });

  const totalBets = Number((betCount as bigint | undefined) ?? 0n);
  const indices = Array.from({ length: totalBets }, (_, i) => BigInt(i));

  const { data: bets } = useReadContracts({
    contracts: indices.map((i) => ({
      address: ADDRESSES.SealedPool,
      abi: SEALED_POOL_ABI,
      functionName: "betInfo",
      args: [marketId, i],
    })),
    query: { enabled: indices.length > 0 },
  });

  const myBets = (bets ?? [])
    .map((r, i) => {
      if (r.status !== "success") return null;
      const arr = r.result as readonly [
        `0x${string}`, bigint, string, string, string, bigint, boolean, boolean,
      ];
      if (arr[0].toLowerCase() !== bettor.toLowerCase()) return null;
      return {
        index: BigInt(i),
        bettor: arr[0],
        stake: arr[1],
        chosenOutcome: arr[5],
        decrypted: arr[6],
        redeemed: arr[7],
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (myBets.length === 0) return null;

  const arr = marketInfo as readonly [string, bigint, bigint, bigint, `0x${string}`, number, bigint, boolean, bigint, bigint, bigint] | undefined;
  if (!arr) return null;
  const status = arr[5] as MarketStatus;
  const oracleOutcome = arr[6];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-muted">Market #{marketId.toString()}</div>
          <div className="font-semibold">{arr[0]}</div>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-bg border border-border text-muted">
          {MarketStatusLabel[status]}
        </span>
      </div>

      <div className="space-y-2">
        {myBets.map((bet) => (
          <BetRow
            key={bet.index.toString()}
            marketId={marketId}
            betIndex={bet.index}
            stake={bet.stake}
            chosenOutcome={bet.chosenOutcome}
            decrypted={bet.decrypted}
            redeemed={bet.redeemed}
            outcomeCount={arr[1]}
            oracleOutcome={oracleOutcome}
            status={status}
          />
        ))}
      </div>
    </div>
  );
}

interface BetRowProps {
  marketId: bigint;
  betIndex: bigint;
  stake: bigint;
  chosenOutcome: bigint;
  decrypted: boolean;
  redeemed: boolean;
  outcomeCount: bigint;
  oracleOutcome: bigint;
  status: MarketStatus;
}

function BetRow(props: BetRowProps) {
  const { writeContractAsync, isPending } = useWriteContract();
  const isWinner = props.decrypted && props.chosenOutcome === props.oracleOutcome;
  const canRedeem = (props.status === MarketStatus.Resolved || props.status === MarketStatus.Cancelled) && !props.redeemed;

  return (
    <div className="flex items-center justify-between text-sm border-t border-border pt-2">
      <div>
        <div>
          Bet #{props.betIndex.toString()} —{" "}
          <span className="font-mono">{(Number(props.stake) / 1_000_000).toFixed(2)} USDC.e</span>
        </div>
        <div className="text-xs text-muted">
          {props.decrypted
            ? `picked outcome ${props.chosenOutcome.toString()}${isWinner ? " ✓ winner" : " ✗ loser"}`
            : "direction encrypted (revealed at resolution)"}
        </div>
      </div>
      {canRedeem && (
        <button
          onClick={() =>
            writeContractAsync({
              address: ADDRESSES.SealedPool,
              abi: SEALED_POOL_ABI,
              functionName: "redeem",
              args: [props.marketId, props.betIndex],
            })
          }
          disabled={isPending}
          className="btn-primary text-sm"
        >
          {isPending ? "Redeeming..." : "Redeem"}
        </button>
      )}
      {props.redeemed && <span className="text-xs text-muted">redeemed</span>}
    </div>
  );
}
