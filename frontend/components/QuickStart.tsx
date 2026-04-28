"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";

import { ADDRESSES, ERC20_ABI } from "../lib/contracts";
import { useFaucet } from "../lib/faucet";

const DISMISSED_KEY = "sortes:onboard:dismissed";
const BET_DONE_KEY = "sortes:onboard:firstBetDone";
const BET_EVENT = "sortes:firstBet";

// Quiet onboarding line. Three numbered steps that auto-progress and
// auto-dismiss when complete. No box, no eyebrow, no dots — just a single
// hairline-bottom row of inline text. The active step picks up the signal
// accent and exposes a CTA next to it.
export function QuickStart() {
  const { address, isConnected } = useAccount();
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [betDone, setBetDone] = useState(false);
  const { claim, status: faucetStatus } = useFaucet();

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
  const hasBalance = balance >= 1_000_000n;

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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-6 text-[13px]"
      >
        <ol className="flex flex-1 flex-wrap items-baseline gap-x-7 gap-y-2">
          <Step n={1} label="connect" done={step1Done} active={activeStep === 1}>
            {!step1Done && (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) =>
                  mounted ? <Cta onClick={openConnectModal}>connect →</Cta> : null
                }
              </ConnectButton.Custom>
            )}
          </Step>
          <Step
            n={2}
            label="claim 5 USDC.e"
            done={step2Done}
            active={activeStep === 2}
            dim={!step1Done}
          >
            {step1Done && !step2Done && address && (
              <Cta
                onClick={() =>
                  claim(address).then(() => setTimeout(() => refetchBal(), 4000))
                }
                disabled={faucetStatus === "pending"}
              >
                {faucetStatus === "pending" ? "claiming…" : "claim →"}
              </Cta>
            )}
          </Step>
          <Step
            n={3}
            label="place a private bet"
            done={step3Done}
            active={activeStep === 3}
            dim={!step2Done}
          >
            {step2Done && !step3Done && (
              <Cta
                onClick={() => {
                  document
                    .querySelector("[data-section='markets']")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                pick a market →
              </Cta>
            )}
          </Step>
        </ol>

        <button
          onClick={dismiss}
          aria-label="Dismiss quick start"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-white/[0.04] hover:text-ink-200"
        >
          <X weight="bold" className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

function Step({
  n,
  label,
  done,
  active,
  dim,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  active: boolean;
  dim?: boolean;
  children?: React.ReactNode;
}) {
  const numTone = done
    ? "text-ink-600"
    : active
    ? "text-signal"
    : dim
    ? "text-ink-700"
    : "text-ink-500";
  const labelTone = done
    ? "text-ink-600 line-through decoration-ink-700"
    : active
    ? "text-ink-100"
    : dim
    ? "text-ink-600"
    : "text-ink-400";

  return (
    <li className="flex items-baseline gap-2">
      <span className={`num text-[10px] tabular-nums ${numTone}`}>0{n}</span>
      <span className={labelTone}>{label}</span>
      {children}
    </li>
  );
}

function Cta({
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
      className="ml-1 text-signal underline-offset-4 transition-colors hover:underline disabled:opacity-50"
    >
      {children}
    </button>
  );
}
