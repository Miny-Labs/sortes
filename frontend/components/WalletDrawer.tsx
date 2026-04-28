"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { X, Drop, ArrowDown, ArrowsLeftRight, ArrowUpRight, Lock, Receipt } from "@phosphor-icons/react";

import {
  ADDRESSES,
  CONFIDENTIAL_WRAPPER_ABI,
  ERC20_ABI,
  EXPLORER_URL,
  MarketStatus,
  MarketStatusLabel,
  SEALED_POOL_ABI,
} from "../lib/contracts";
import { useFaucet } from "../lib/faucet";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "balances" | "bets";

export function WalletDrawer({ open, onClose }: Props) {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>("balances");

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
            className="fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-[460px] flex-col border-l border-white/[0.06] bg-ink-900"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
              <div>
                <div className="label-eyebrow">Wallet</div>
                <div className="num text-[13px] text-ink-200">
                  {address ? `${address.slice(0, 10)}…${address.slice(-6)}` : "Not connected"}
                </div>
              </div>
              <button
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-white/[0.04] hover:text-ink-100"
                aria-label="Close"
              >
                <X weight="bold" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-white/[0.06] px-4 pt-3">
              <TabBtn active={tab === "balances"} onClick={() => setTab("balances")}>
                Balances
              </TabBtn>
              <TabBtn active={tab === "bets"} onClick={() => setTab("bets")}>
                My bets
              </TabBtn>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
              {tab === "balances" ? <BalancesPanel /> : <BetsPanel />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-xs transition-colors ${
        active ? "text-ink-100" : "text-ink-500 hover:text-ink-200"
      }`}
    >
      {children}
      {active && (
        <motion.div
          layoutId="walletTabUnderline"
          className="absolute inset-x-3 -bottom-px h-px bg-ink-100"
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
        />
      )}
    </button>
  );
}

function BalancesPanel() {
  const { address } = useAccount();
  const { claim, status: faucetStatus, message: faucetMessage, txHash: faucetTx } = useFaucet();

  const { data: usdcBal, refetch: refetchUsdc } = useReadContract({
    address: ADDRESSES.USDC_e,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: cnfEnc, refetch: refetchCnf } = useReadContract({
    address: ADDRESSES.ConfidentialWrapper_cUSDC,
    abi: CONFIDENTIAL_WRAPPER_ABI,
    functionName: "encryptedBalanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const usdcReadable = usdcBal != null ? formatUnits(usdcBal as bigint, 6) : "0";
  const hasCnf = cnfEnc != null && (cnfEnc as `0x${string}`).length > 2;

  return (
    <div className="space-y-6">
      <BalanceRow
        eyebrow="Bridged USDC"
        symbol="USDC.e"
        amount={usdcReadable}
        sub="Public balance · used for sealed bets and wrap input"
      />

      <BalanceRow
        eyebrow="Confidential USDC"
        symbol="cnfUSDC.e"
        amount={hasCnf ? "encrypted" : "—"}
        sub={hasCnf
          ? "Balance held as ciphertext. Decryptable client-side with your viewer key."
          : "Wrap USDC.e to start using the confidential bet path."}
        encrypted
      />

      {address && (
        <FaucetCard
          status={faucetStatus}
          message={faucetMessage}
          txHash={faucetTx}
          onClaim={() => {
            claim(address).then(() => {
              setTimeout(() => refetchUsdc(), 4000);
            });
          }}
        />
      )}

      {address && (
        <WrapCard
          usdcBalance={(usdcBal as bigint | undefined) ?? 0n}
          onSuccess={() => {
            refetchUsdc();
            refetchCnf();
          }}
        />
      )}
    </div>
  );
}

function BalanceRow({
  eyebrow,
  symbol,
  amount,
  sub,
  encrypted = false,
}: {
  eyebrow: string;
  symbol: string;
  amount: string;
  sub: string;
  encrypted?: boolean;
}) {
  return (
    <div className="space-y-3 border-b border-white/[0.04] pb-6 last:border-b-0">
      <div className="label-eyebrow flex items-center gap-2">
        {eyebrow}
        {encrypted && <Lock weight="fill" className="h-3 w-3 text-signal" />}
      </div>
      <div className="flex items-baseline justify-between">
        <div className="num text-[28px] font-medium tracking-tight text-ink-100">
          {amount}
        </div>
        <div className="font-mono text-[10px] tracking-[0.18em] text-ink-500">{symbol}</div>
      </div>
      <p className="max-w-[40ch] text-[12px] leading-relaxed text-ink-500">{sub}</p>
    </div>
  );
}

function FaucetCard({
  status,
  message,
  txHash,
  onClaim,
}: {
  status: ReturnType<typeof useFaucet>["status"];
  message: string | null;
  txHash: string | null;
  onClaim: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="label-eyebrow">Faucet</div>
          <div className="mt-1 text-[14px] text-ink-100">5 USDC.e on the house.</div>
          <p className="mt-1 max-w-[36ch] text-[12px] leading-relaxed text-ink-500">
            One claim per address per 24h. Drips from the deployer wallet so you can place a real
            sealed bet without bridging.
          </p>
        </div>
        <button
          onClick={onClaim}
          disabled={status === "pending"}
          className="btn-signal whitespace-nowrap text-xs"
        >
          <Drop weight="fill" className="h-4 w-4" />
          {status === "pending" ? "Sending…" : status === "ok" ? "Sent" : "Claim 5 USDC.e"}
        </button>
      </div>
      {message && (
        <div className="mt-4 rounded-lg border border-white/[0.04] bg-ink-950/60 px-3 py-2 text-[11px] text-ink-300">
          {message}
          {txHash && (
            <a
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="num ml-2 inline-flex items-center gap-1 text-signal underline-offset-2 hover:underline"
            >
              {txHash.slice(0, 10)}…
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function WrapCard({
  usdcBalance,
  onSuccess,
}: {
  usdcBalance: bigint;
  onSuccess: () => void;
}) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("1");
  const [step, setStep] = useState<"idle" | "approving" | "wrapping" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const stake = useMemo(() => {
    try {
      return parseUnits(amount || "0", 6);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { data: allowance } = useReadContract({
    address: ADDRESSES.USDC_e,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.ConfidentialWrapper_cUSDC] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const needsApproval = (allowance as bigint | undefined) === undefined || (allowance as bigint) < stake;
  const insufficient = stake === 0n || stake > usdcBalance;

  const { writeContractAsync } = useWriteContract();

  const handleWrap = async () => {
    setErrorMsg(null);
    setTxHash(null);
    if (!address || stake === 0n) return;
    try {
      if (needsApproval) {
        setStep("approving");
        await writeContractAsync({
          address: ADDRESSES.USDC_e,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.ConfidentialWrapper_cUSDC, BigInt(2) ** BigInt(255)],
        });
      }
      setStep("wrapping");
      const hash = await writeContractAsync({
        address: ADDRESSES.ConfidentialWrapper_cUSDC,
        abi: CONFIDENTIAL_WRAPPER_ABI,
        functionName: "depositFor",
        args: [address, stake],
      });
      setTxHash(hash);
      setStep("ok");
      onSuccess();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Wrap failed");
      setStep("error");
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-eyebrow">Wrap</div>
          <div className="mt-1 text-[14px] text-ink-100">USDC.e → cnfUSDC.e</div>
          <p className="mt-1 max-w-[36ch] text-[12px] leading-relaxed text-ink-500">
            Optional. Wraps your bridged USDC into a SKALE confidential ERC-20 so even your stake
            amount stays private.
          </p>
        </div>
        <ArrowsLeftRight weight="duotone" className="h-5 w-5 text-ink-400" />
      </div>

      <div className="mt-4 flex gap-2">
        <input
          inputMode="decimal"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input-mono"
        />
        <button
          onClick={handleWrap}
          disabled={step === "approving" || step === "wrapping" || insufficient}
          className="btn-ghost whitespace-nowrap"
        >
          <ArrowDown weight="bold" className="h-3.5 w-3.5" />
          {step === "approving"
            ? "Approving…"
            : step === "wrapping"
            ? "Wrapping…"
            : insufficient
            ? "Insufficient"
            : needsApproval
            ? "Approve & wrap"
            : "Wrap"}
        </button>
      </div>

      {step === "ok" && txHash && (
        <div className="mt-3 text-[11px] text-signal">
          Wrapped {amount} USDC.e ·{" "}
          <a
            className="underline-offset-2 hover:underline"
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {txHash.slice(0, 10)}…
          </a>
        </div>
      )}
      {step === "error" && errorMsg && (
        <div className="mt-3 max-w-full break-words text-[11px] text-warn">{errorMsg}</div>
      )}
    </div>
  );
}

function BetsPanel() {
  const { address } = useAccount();
  const { data: count } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "marketCount",
  });

  if (!address) {
    return (
      <EmptyState
        title="Connect to see your bets"
        body="Once you're connected, your sealed positions across every market show up here with redeem actions."
      />
    );
  }

  const ids: bigint[] = count
    ? Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1))
    : [];

  if (ids.length === 0) {
    return <EmptyState title="No markets yet" body="Markets created by the operator appear here." />;
  }

  return (
    <div className="space-y-4">
      {ids.map((id) => (
        <MarketBets key={id.toString()} marketId={id} bettor={address} />
      ))}
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
        stake: arr[1],
        chosenOutcome: arr[5],
        decrypted: arr[6],
        redeemed: arr[7],
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (myBets.length === 0) return null;

  const arr = marketInfo as readonly [
    string,
    bigint,
    bigint,
    bigint,
    `0x${string}`,
    number,
    bigint,
    boolean,
    bigint,
    bigint,
    bigint,
  ] | undefined;
  if (!arr) return null;

  const status = arr[5] as MarketStatus;
  const oracleOutcome = arr[6];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-eyebrow">market #{marketId.toString()}</div>
          <div className="mt-1 text-[14px] leading-snug text-ink-100">{arr[0]}</div>
        </div>
        <span className="num shrink-0 rounded-full border border-white/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-400">
          {MarketStatusLabel[status]}
        </span>
      </div>

      <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.04] bg-white/[0.015]">
        {myBets.map((bet) => (
          <BetRow
            key={bet.index.toString()}
            marketId={marketId}
            betIndex={bet.index}
            stake={bet.stake}
            chosenOutcome={bet.chosenOutcome}
            decrypted={bet.decrypted}
            redeemed={bet.redeemed}
            oracleOutcome={oracleOutcome}
            status={status}
          />
        ))}
      </div>
    </div>
  );
}

function BetRow(props: {
  marketId: bigint;
  betIndex: bigint;
  stake: bigint;
  chosenOutcome: bigint;
  decrypted: boolean;
  redeemed: boolean;
  oracleOutcome: bigint;
  status: MarketStatus;
}) {
  const { writeContractAsync, isPending } = useWriteContract();
  const isWinner = props.decrypted && props.chosenOutcome === props.oracleOutcome;
  const canRedeem =
    (props.status === MarketStatus.Resolved || props.status === MarketStatus.Cancelled) &&
    !props.redeemed;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
      <div className="min-w-0">
        <div className="num text-ink-100">
          {(Number(props.stake) / 1_000_000).toFixed(2)} <span className="text-ink-500">USDC.e</span>
        </div>
        <div className="mt-0.5 text-[11px] text-ink-500">
          {props.decrypted ? (
            <>
              picked outcome <span className="num text-ink-300">{props.chosenOutcome.toString()}</span>{" "}
              {isWinner ? (
                <span className="text-signal">· winner</span>
              ) : (
                <span className="text-ink-500">· lost</span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" />
              direction encrypted until resolution
            </span>
          )}
        </div>
      </div>
      {canRedeem ? (
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
          className="btn-primary text-xs"
        >
          <Receipt weight="duotone" className="h-3.5 w-3.5" />
          {isPending ? "Redeeming…" : "Redeem"}
        </button>
      ) : props.redeemed ? (
        <span className="num text-[11px] text-ink-500">redeemed</span>
      ) : null}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-white/[0.08] p-6">
      <Receipt weight="duotone" className="h-5 w-5 text-ink-500" />
      <div className="text-[14px] text-ink-100">{title}</div>
      <p className="max-w-[36ch] text-[12px] leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}
