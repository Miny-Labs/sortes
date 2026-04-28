import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sortes — Privacy-first prediction markets",
  description:
    "Polymarket UX with sealed-bid privacy. Built on SKALE Base using BITE Phase 2 + Phase 3.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <header className="border-b border-border">
            <nav className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <Link href="/" className="font-bold text-xl tracking-tight">
                  <span className="text-accent">Sortes</span>
                  <span className="text-muted text-xs ml-2 font-normal">testnet alpha</span>
                </Link>
                <div className="hidden sm:flex items-center gap-4 text-sm text-muted">
                  <Link href="/" className="hover:text-white">Markets</Link>
                  <Link href="/portfolio" className="hover:text-white">Portfolio</Link>
                  <Link href="/admin" className="hover:text-white">Admin</Link>
                </div>
              </div>
              <ConnectButtonClient />
            </nav>
          </header>
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
          <footer className="border-t border-border mt-16">
            <div className="max-w-6xl mx-auto px-6 py-6 text-sm text-muted flex justify-between">
              <span>Sortes alpha · SKALE Base Sepolia · BITE Phase 2 + Phase 3</span>
              <a
                href="https://github.com/Miny-Labs/sortes"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                GitHub
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}

// Hydration-safe wallet connect button.
import { ConnectButton } from "@rainbow-me/rainbowkit";

function ConnectButtonClient() {
  return <ConnectButton showBalance accountStatus="address" chainStatus="icon" />;
}
