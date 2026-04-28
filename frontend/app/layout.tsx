import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";

import { Providers } from "./providers";
import { TopBar } from "../components/TopBar";

export const metadata: Metadata = {
  title: "Sortes — sealed prediction markets",
  description:
    "Polymarket-shape liquidity, sealed-bid privacy. Encrypted bet direction, public aggregate odds, on-chain pari-mutuel payouts. Built on SKALE BITE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-[100dvh]">
        <Providers>
          <TopBar />
          <main className="relative z-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
