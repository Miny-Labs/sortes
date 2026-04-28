"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet, Drop, ArrowUpRight } from "@phosphor-icons/react";

import { WalletDrawer } from "./WalletDrawer";
import { useFaucet } from "../lib/faucet";

export function TopBar() {
  const { address, isConnected } = useAccount();
  const [walletOpen, setWalletOpen] = useState(false);
  const { claim, status, message, txHash } = useFaucet();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <Link href="/" className="group flex items-center gap-3">
            <Mark />
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-medium tracking-tight text-ink-100">sortes</span>
              <span className="font-mono text-[9px] tracking-[0.2em] text-ink-500">SEALED · v4</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {isConnected && address ? (
              <button
                onClick={() => claim(address)}
                disabled={status === "pending"}
                className="pill group hover:text-ink-100"
                title="Drip 5 USDC.e from the dev faucet"
              >
                <Drop weight="duotone" className="h-3.5 w-3.5 text-signal" />
                <span className="num">
                  {status === "pending" ? "claiming…" : status === "ok" ? "claimed" : "5 USDC.e"}
                </span>
                {status === "ok" && txHash && (
                  <ArrowUpRight weight="bold" className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                )}
              </button>
            ) : null}

            {isConnected ? (
              <button
                onClick={() => setWalletOpen(true)}
                className="pill hover:text-ink-100"
                title="Wallet, balances, bets"
              >
                <Wallet weight="duotone" className="h-3.5 w-3.5" />
                <span className="num">
                  {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""}
                </span>
              </button>
            ) : (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) =>
                  mounted ? (
                    <button onClick={openConnectModal} className="btn-primary text-xs">
                      Connect
                    </button>
                  ) : null
                }
              </ConnectButton.Custom>
            )}
          </div>
        </div>

        {message && (
          <div className="mx-auto max-w-[1400px] px-6 pb-3 text-xs text-ink-400">
            <span className={status === "error" ? "text-warn" : "text-signal"}>{message}</span>
            {txHash && (
              <a
                href={`https://base-sepolia-testnet-explorer.skalenodes.com/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="num ml-2 inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {txHash.slice(0, 10)}…
                <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </header>

      <WalletDrawer open={walletOpen} onClose={() => setWalletOpen(false)} />
    </>
  );
}

function Mark() {
  // Custom mark — concentric arcs hinting at sealed/disclosed layers.
  // No emoji, no library glyph; this is the only place we draw the brand.
  return (
    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-100" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
        <path d="M5 12a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.6" fill="#34d399" />
      </svg>
    </span>
  );
}
