"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Check, X, Sparkle } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";

import { ADDRESSES, ERC20_ABI } from "../lib/contracts";
import { useFaucet } from "../lib/faucet";

const DISMISSED_KEY = "sortes:onboard:dismissed";
const BET_DONE_KEY = "sortes:onboard:firstBetDone";
const BET_EVENT = "sortes:firstBet";

// First-time "from zero to your first sealed bet" path. Three steps that
// auto-progress as the user makes progress, and the whole strip
// self-destructs once the user is past it. Dismiss button stores a flag in
// localStorage so returning users don't see it again.
export function QuickStart() {
  const { address, isConnected } = useAccount();
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [betDone, setBetDone] = useState(false);
  const { claim, status: faucetStatus } = useFaucet();

  // Defer localStorage reads until after hydration to keep SSR markup stable.
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    setBetDone(localStorage.getItem(BET_DONE_KEY) === "1");
    setHydrated(true);

    const onBet = () =>
      setBetDone(localStorage.getItem(BET_DONE_KEY) === "1");
    window.addEventListener(BET_EVENT, onBet);
    window.addEventListener("storage", onBet);
    return () => {
      window.removeEventListener(BET_EVENT, onBet);
      window.removeEventListener("storage", onBet);
    };
  }, []);

  const { data: usdcBal, refetch: refetchBal } = useReadContract({
    address: ADDRESSES.USDC_e,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const balance = (usdcBal as bigint | undefined) ?? 0n;
  const hasBalance = balance >= 1_000_000n; // 1 USDC.e

  const step1Done = isConnected;
  const step2Done = step1Done && hasBalance;
  const step3Done = step2Done && betDone;
  const allDone = step1Done && step2Done && step3Done;

  if (!hydrated) return null;
  if (dismissed || allDone) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const activeStep: 1 | 2 | 3 = !step1Done ? 1 : !step2Done ? 2 : 3;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="border-b border-white/[0.05] bg-gradient-to-b from-signal/[0.03] to-transparent"
      >
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-ink-400">
            <Sparkle weight="duotone" className="h-3.5 w-3.5 text-signal" />
            quick start
          </div>

          <ol className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 md:justify-end">
            <Step
              n={1}
              label="Connect"
              done={step1Done}
              active={activeStep === 1}
            >
              {!step1Done && (
                <ConnectButton.Custom>
                  {({ openConnectModal, mounted }) =>
                    mounted ? (
                      <StepCta onClick={openConnectModal}>connect wallet →</StepCta>
                    ) : null
                  }
                </ConnectButton.Custom>
              )}
            </Step>

            <Sep />

            <Step
              n={2}
              label="Claim 5 USDC.e"
              done={step2Done}
              active={activeStep === 2}
              disabled={!step1Done}
            >
              {step1Done && !step2Done && address && (
                <StepCta
                  onClick={() => {
                    claim(address).then(() => setTimeout(() => refetchBal(), 4000));
                  }}
                  disabled={faucetStatus === "pending"}
                >
                  {faucetStatus === "pending" ? "claiming…" : "claim faucet →"}
                </StepCta>
              )}
            </Step>

            <Sep />

            <Step
              n={3}
              label="Place a sealed bet"
              done={step3Done}
              active={activeStep === 3}
              disabled={!step2Done}
            >
              {step2Done && !step3Done && (
                <StepCta
                  onClick={() => {
                    document
                      .querySelector("[data-section='markets']")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  pick a market →
                </StepCta>
              )}
            </Step>
          </ol>

          <button
            onClick={dismiss}
            aria-label="Dismiss quick start"
            className="absolute right-4 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-white/[0.04] hover:text-ink-200 md:static"
          >
            <X weight="bold" className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Step({
  n,
  label,
  done,
  active,
  disabled,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  active: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const labelTone = done
    ? "text-ink-500 line-through decoration-ink-700"
    : active
    ? "text-ink-100"
    : disabled
    ? "text-ink-600"
    : "text-ink-400";

  return (
    <li className="flex items-center gap-2 text-[12px]">
      <Dot done={done} active={active} />
      <span className="font-mono text-[10px] tabular-nums text-ink-500">
        0{n}
      </span>
      <span className={labelTone}>{label}</span>
      {children}
    </li>
  );
}

function Dot({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-signal/10 ring-1 ring-signal/40">
        <Check weight="bold" className="h-3 w-3 text-signal" />
      </span>
    );
  }
  return (
    <span
      className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border ${
        active ? "border-signal/60" : "border-white/10"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-signal animate-pulse-soft" : "bg-ink-700"
        }`}
      />
    </span>
  );
}

function Sep() {
  return (
    <li aria-hidden className="hidden h-px w-5 bg-white/[0.06] md:inline-block" />
  );
}

function StepCta({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ml-1 text-[12px] text-signal underline-offset-4 transition-colors hover:underline disabled:opacity-50"
    >
      {children}
    </button>
  );
}
