"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CaretRight } from "@phosphor-icons/react";

import { WalletDrawer } from "./WalletDrawer";

export function TopBar() {
  const { address, isConnected } = useAccount();
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <Link
            href="/"
            aria-label="Sortes home"
            className="group inline-flex items-center gap-3"
          >
            <Mark />
          </Link>

          {isConnected && address ? (
            <WalletButton
              address={address}
              onClick={() => setWalletOpen(true)}
            />
          ) : (
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) =>
                mounted ? <ConnectCta onClick={openConnectModal} /> : null
              }
            </ConnectButton.Custom>
          )}
        </div>
      </header>

      <WalletDrawer open={walletOpen} onClose={() => setWalletOpen(false)} />
    </>
  );
}

// Solid CTA for the not-connected state. The arrow is part of the button
// affordance; on hover it slides forward.
function ConnectCta({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex h-11 items-center gap-2 rounded-full bg-ink-100 px-5 text-[13px] font-medium text-ink-950 transition-colors hover:bg-white"
    >
      Connect
      <CaretRight
        weight="bold"
        className="h-3 w-3 -translate-x-0.5 transition-transform duration-200 group-hover:translate-x-0"
      />
    </button>
  );
}

// Wallet pill for the connected state. Live signal-pulsing dot, mono
// address, no chain icon, no balance — the wallet drawer carries the rest.
function WalletButton({
  address,
  onClick,
}: {
  address: `0x${string}`;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Open wallet"
      className="group inline-flex h-11 items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] pl-3 pr-4 text-[13px] text-ink-200 transition-colors hover:border-white/20 hover:text-ink-100"
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inset-0 animate-pulse-soft rounded-full bg-signal" />
        <span className="relative h-2 w-2 rounded-full bg-signal/80" />
      </span>
      <span className="num text-[12px] tracking-tight">
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
    </button>
  );
}

// Brand mark — concentric arcs hinting at sealed / disclosed layers.
function Mark() {
  return (
    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-100" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
        <path d="M5 12a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.6" fill="oklch(0.79 0.16 160)" />
      </svg>
    </span>
  );
}
