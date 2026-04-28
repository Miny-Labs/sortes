"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CaretRight } from "@phosphor-icons/react";

import { WalletDrawer } from "./WalletDrawer";

// Floating, transparent topbar. No logo, no background, no border. Just the
// wallet/connect button on the right. The button itself is a refined glass
// pill that reads cleanly over the hero video and over the markets bento.
export function TopBar() {
  const { address, isConnected } = useAccount();
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-end px-6">
          {isConnected && address ? (
            <WalletButton address={address} onClick={() => setWalletOpen(true)} />
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

// Glass pill with a subtle keyline. On hover, the pill fills with the ink-100
// surface so the affordance is unambiguous. Caret nudges forward on hover.
function ConnectCta({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-ink-950/40 px-5 text-[13px] font-medium text-ink-100 backdrop-blur-md transition-all duration-200 ease-out hover:border-white/0 hover:bg-ink-100 hover:text-ink-950"
    >
      Connect
      <CaretRight
        weight="bold"
        className="h-3 w-3 -translate-x-0.5 transition-transform duration-200 group-hover:translate-x-0"
      />
    </button>
  );
}

// Wallet pill (connected). Same glass treatment, with a pulsing signal dot
// in front of the address.
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
      className="group inline-flex h-11 items-center gap-3 rounded-full border border-white/15 bg-ink-950/40 px-4 text-[13px] text-ink-200 backdrop-blur-md transition-all duration-200 ease-out hover:border-white/30 hover:text-ink-100"
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
