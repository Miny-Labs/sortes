"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Lock, Key, ShieldCheck, ArrowUpRight, Drop, Eye, EyeSlash } from "@phosphor-icons/react";

import {
  ADDRESSES,
  CONFIDENTIAL_WRAPPER_ABI,
  ERC20_ABI,
  EXPLORER_URL,
  SEALED_POOL_ABI,
} from "../lib/contracts";
import type { MarketData } from "../lib/markets";
import { useFaucet } from "../lib/faucet";

interface Props {
  market: MarketData;
  onSubmitted?: () => void;
}

type Mode = "sealed" | "confidential";

const QUICK_AMOUNTS = ["1", "5", "25"];

export function BetForm({ market, onSubmitted }: Props) {
  const { address, isConnected } = useAccount();
  const [outcome, setOutcome] = useState<bigint>(market.outcomeCount === 2n ? 1n : 0n);
  const [amount, setAmount] = useState("1");
  const [mode, setMode] = useState<Mode>("sealed");
  const [viewerKey, setViewerKey] = useState<{ x: `0x${string}`; y: `0x${string}` } | null>(null);
  const [keyShort, setKeyShort] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tx: string; mode: Mode } | null>(null);
  const { claim, status: faucetStatus } = useFaucet();

  // Public-side reads.
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: ADDRESSES.USDC_e,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
    address: ADDRESSES.USDC_e,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.SealedPool] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  // Confidential-side reads — what cnfUSDC.e address (if any) the market accepts,
  // and the user's cnfUSDC.e allowance to the pool. The encrypted balance can't
  // be read meaningfully without the viewer key, so we don't gate on it here —
  // the contract will revert at submit time if the user is short.
  const { data: confidentialCollateral } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "confidentialCollateralOf",
    args: [market.id],
    query: { refetchInterval: 30_000 },
  });

  const cnfAddress = (confidentialCollateral as `0x${string}` | undefined) ?? zeroAddress;
  const confidentialEnabled =
    cnfAddress !== zeroAddress && cnfAddress.toLowerCase() !== zeroAddress;

  const { data: cnfAllowance, refetch: refetchCnfAllowance } = useReadContract({
    address: ADDRESSES.ConfidentialWrapper_cUSDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.SealedPool] : undefined,
    query: { enabled: !!address && confidentialEnabled, refetchInterval: 12_000 },
  });

  const { writeContractAsync, isPending } = useWriteContract();

  const stakeWei = useMemo(() => {
    try {
      return parseUnits(amount || "0", 6);
    } catch {
      return 0n;
    }
  }, [amount]);

  const balance = (usdcBalance as bigint | undefined) ?? 0n;
  const balanceReadable = formatUnits(balance, 6);
  const usdcAllowanceVal = (usdcAllowance as bigint | undefined) ?? 0n;
  const cnfAllowanceVal = (cnfAllowance as bigint | undefined) ?? 0n;

  const insufficientPublicBalance = mode === "sealed" && stakeWei > balance;
  const sealedNeedsApproval = mode === "sealed" && usdcAllowanceVal < stakeWei;
  const confidentialNeedsApproval = mode === "confidential" && cnfAllowanceVal < stakeWei;

  // Auto-restore viewer key from localStorage when address+market match.
  useEffect(() => {
    if (!address) return;
    const k = localStorage.getItem(`sortes:viewerKey:${address}:${market.id}`);
    if (k && k.length >= 64) {
      setKeyShort(`${k.slice(0, 6)}…${k.slice(-4)}`);
      void deriveAndSetPubKey(k);
    }
  }, [address, market.id]);

  async function deriveAndSetPubKey(privHex: string) {
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const priv = hexToBytes(privHex);
    const pub = secp256k1.getPublicKey(priv, false);
    const x = ("0x" + bytesToHex(pub.slice(1, 33))) as `0x${string}`;
    const y = ("0x" + bytesToHex(pub.slice(33, 65))) as `0x${string}`;
    setViewerKey({ x, y });
  }

  async function generateViewerKey() {
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const priv = secp256k1.utils.randomPrivateKey();
    const privHex = bytesToHex(priv);
    if (address) {
      localStorage.setItem(`sortes:viewerKey:${address}:${market.id}`, privHex);
    }
    setKeyShort(`${privHex.slice(0, 6)}…${privHex.slice(-4)}`);
    await deriveAndSetPubKey(privHex);
  }

  async function handleApprove() {
    setError(null);
    try {
      if (mode === "sealed") {
        await writeContractAsync({
          address: ADDRESSES.USDC_e,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.SealedPool, BigInt(2) ** BigInt(255)],
        });
        await refetchUsdcAllowance();
      } else {
        await writeContractAsync({
          address: ADDRESSES.ConfidentialWrapper_cUSDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.SealedPool, BigInt(2) ** BigInt(255)],
        });
        await refetchCnfAllowance();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!viewerKey) {
      try {
        await generateViewerKey();
      } catch {
        setError("Could not derive viewer key.");
        return;
      }
    }
    try {
      const vk = viewerKey ?? (await waitForKey());
      if (mode === "sealed") {
        const tx = await writeContractAsync({
          address: ADDRESSES.SealedPool,
          abi: SEALED_POOL_ABI,
          functionName: "submitSealedBetWithEncryption",
          args: [market.id, outcome, vk, stakeWei],
        });
        setSuccess({ tx, mode: "sealed" });
      } else {
        const tx = await writeContractAsync({
          address: ADDRESSES.SealedPool,
          abi: SEALED_POOL_ABI,
          functionName: "submitConfidentialBet",
          args: [market.id, outcome, stakeWei, vk],
        });
        setSuccess({ tx, mode: "confidential" });
      }
      onSubmitted?.();
      await refetchBalance();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const waitForKey = () =>
    new Promise<{ x: `0x${string}`; y: `0x${string}` }>((res, rej) => {
      let tries = 0;
      const t = setInterval(() => {
        if (viewerKey) {
          clearInterval(t);
          res(viewerKey);
        }
        if (++tries > 30) {
          clearInterval(t);
          rej(new Error("Viewer key not available"));
        }
      }, 50);
    });

  if (!isConnected) return <ConnectGate />;

  const ctaLabel = (() => {
    if (isPending) return "Confirming…";
    if (market.status !== 1) return "Market closed";
    if (mode === "sealed") {
      if (insufficientPublicBalance) return "Insufficient USDC.e";
      if (sealedNeedsApproval) return "Approve USDC.e";
      return "Place sealed bet";
    }
    if (!confidentialEnabled) return "Confidential not enabled here";
    if (confidentialNeedsApproval) return "Approve cnfUSDC.e";
    return "Place confidential bet";
  })();

  const ctaDisabled =
    isPending ||
    stakeWei === 0n ||
    market.status !== 1 ||
    (mode === "sealed" && insufficientPublicBalance) ||
    (mode === "confidential" && !confidentialEnabled);

  const onCtaClick =
    mode === "sealed"
      ? sealedNeedsApproval
        ? handleApprove
        : handleSubmit
      : confidentialNeedsApproval
      ? handleApprove
      : handleSubmit;

  return (
    <div className="space-y-6">
      <ModeToggle
        mode={mode}
        onChange={setMode}
        confidentialEnabled={confidentialEnabled}
      />

      <div>
        <div className="label-eyebrow">Direction</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {Array.from({ length: Number(market.outcomeCount) }, (_, i) => {
            const isYes = market.outcomeCount === 2n && i === 1;
            const isNo = market.outcomeCount === 2n && i === 0;
            const selected = outcome === BigInt(i);
            const label = isYes ? "YES" : isNo ? "NO" : `Outcome ${i}`;
            const baseTone = isYes
              ? "border-signal/30 text-signal hover:border-signal/60"
              : isNo
              ? "border-warn/30 text-warn hover:border-warn/60"
              : "border-white/10 text-ink-200 hover:border-white/30";
            const selectedTone = isYes
              ? "border-signal bg-signal/10 text-signal"
              : isNo
              ? "border-warn bg-warn/10 text-warn"
              : "border-ink-200 bg-ink-200/10 text-ink-100";
            return (
              <button
                key={i}
                onClick={() => setOutcome(BigInt(i))}
                className={`btn-base h-12 rounded-xl border text-[13px] font-medium tracking-wide transition-all ${
                  selected ? selectedTone : baseTone
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <div className="label-eyebrow">Stake</div>
          {mode === "sealed" ? (
            <div className="font-mono text-[11px] tabular-nums text-ink-500">
              balance{" "}
              <span className={insufficientPublicBalance ? "text-warn" : "text-ink-300"}>
                {Number(balanceReadable).toFixed(2)}
              </span>{" "}
              USDC.e
            </div>
          ) : (
            <div className="font-mono text-[11px] tabular-nums text-ink-500">
              cnfUSDC.e{" "}
              <span className="text-ink-300 inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> encrypted
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-mono pr-20"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
              {mode === "sealed" ? "USDC.e" : "cnfUSDC.e"}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className="rounded-full border border-white/[0.06] px-3 py-1 font-mono text-[10px] tabular-nums text-ink-400 transition hover:border-white/20 hover:text-ink-100"
            >
              {v}
            </button>
          ))}
          {mode === "sealed" && (
            <button
              onClick={() => setAmount(formatUnits(balance, 6))}
              disabled={balance === 0n}
              className="rounded-full border border-white/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400 transition hover:border-white/20 hover:text-ink-100 disabled:opacity-40"
            >
              max
            </button>
          )}
        </div>

        {mode === "sealed" && insufficientPublicBalance && address && (
          <button
            onClick={() => claim(address).then(() => setTimeout(() => refetchBalance(), 4000))}
            disabled={faucetStatus === "pending"}
            className="mt-3 inline-flex items-center gap-2 text-[11px] text-signal underline-offset-4 hover:underline"
          >
            <Drop className="h-3.5 w-3.5" />
            {faucetStatus === "pending"
              ? "claiming faucet…"
              : "Need more? Claim 5 USDC.e from the faucet"}
          </button>
        )}

        {mode === "confidential" && !confidentialEnabled && (
          <div className="mt-3 rounded-xl border border-dashed border-white/[0.08] p-3 text-[11px] leading-relaxed text-ink-500">
            This market is public-only. The operator hasn't enabled cnfUSDC.e here.
            Switch back to <span className="text-ink-300">Sealed</span> to bet, or pick another
            market with confidential mode active.
          </div>
        )}
        {mode === "confidential" && confidentialEnabled && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-ink-400">
            Confidential mode: <span className="text-ink-200">stake amount and direction both
            encrypted</span>. Requires cnfUSDC.e in your wallet — wrap from the wallet drawer
            first if needed.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="label-eyebrow flex items-center gap-1.5">
              <Key className="h-3 w-3" />
              Viewer key
            </div>
            <div className="mt-1 text-[12px] leading-relaxed text-ink-400">
              {keyShort
                ? "Saved in this browser. Used to decrypt your payout after resolution."
                : "Auto-generated when you place your first bet. Stored locally only."}
            </div>
          </div>
          {keyShort ? (
            <span className="num shrink-0 text-[11px] text-ink-300">{keyShort}</span>
          ) : (
            <button onClick={generateViewerKey} className="btn-ghost text-xs">
              Generate now
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <MagneticCTA disabled={ctaDisabled} onClick={onCtaClick}>
          {ctaLabel}
        </MagneticCTA>

        <div className="flex items-center gap-2 px-1 text-[11px] text-ink-500">
          <ShieldCheck weight="duotone" className="h-3.5 w-3.5 text-signal" />
          <span>
            {mode === "sealed"
              ? "Sealed direction via SKALE BITE Phase 3. Aggregate odds reveal in batches of two or more (anti-deanonymization)."
              : "Direction and stake amount both encrypted via SKALE BITE Phase 3 against cnfUSDC.e collateral. Same unified pot as public bets."}
          </span>
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-signal/20 bg-signal/[0.04] p-4 text-[12px]">
          <div className="text-signal">
            {success.mode === "confidential" ? "Confidential bet sealed." : "Sealed bet placed."}
          </div>
          <a
            href={`${EXPLORER_URL}/tx/${success.tx}`}
            target="_blank"
            rel="noreferrer"
            className="num mt-1 inline-flex items-center gap-1 text-ink-300 underline-offset-2 hover:underline"
          >
            {success.tx.slice(0, 12)}…
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      )}

      {error && (
        <div className="break-words rounded-xl border border-warn/20 bg-warn/[0.04] p-4 text-[12px] text-warn">
          {error}
        </div>
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
  confidentialEnabled,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  confidentialEnabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1">
      <ModeButton
        active={mode === "sealed"}
        onClick={() => onChange("sealed")}
        icon={<Eye weight="duotone" className="h-3.5 w-3.5" />}
        label="Sealed"
        sub="direction private"
      />
      <ModeButton
        active={mode === "confidential"}
        onClick={() => onChange("confidential")}
        icon={<EyeSlash weight="duotone" className="h-3.5 w-3.5" />}
        label="Confidential"
        sub={confidentialEnabled ? "+ amount private" : "not enabled"}
        dim={!confidentialEnabled}
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  sub,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
  dim?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[12px] transition ${
        active
          ? "bg-white/[0.05] text-ink-100"
          : dim
          ? "text-ink-600 hover:text-ink-400"
          : "text-ink-400 hover:text-ink-100"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="hidden font-mono text-[10px] tracking-tight text-ink-500 sm:inline">
        · {sub}
      </span>
    </button>
  );
}

function ConnectGate() {
  return (
    <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="flex items-center gap-2 text-[13px] text-ink-100">
        <Lock weight="duotone" className="h-4 w-4 text-signal" />
        Connect to place a sealed bet
      </div>
      <p className="text-[12px] leading-relaxed text-ink-500">
        You can browse, inspect odds, and read the contract without a wallet. Connecting is only
        needed to sign the encrypted bet payload.
      </p>
      <ConnectButton.Custom>
        {({ openConnectModal, mounted }) =>
          mounted ? (
            <button onClick={openConnectModal} className="btn-primary text-xs">
              Connect wallet
            </button>
          ) : null
        }
      </ConnectButton.Custom>
    </div>
  );
}

function MagneticCTA({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18 });
  const sy = useSpring(y, { stiffness: 220, damping: 18 });
  const transform = useTransform([sx, sy], ([nx, ny]) => `translate3d(${nx}px, ${ny}px, 0)`);

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
    const py = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
    x.set(px * 8);
    y.set(py * 6);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      style={{ transform }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.985 }}
      className="btn-signal w-full text-[13px] disabled:opacity-50 disabled:saturate-50"
    >
      {children}
    </motion.button>
  );
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(h: string): Uint8Array {
  const clean = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; ++i) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
