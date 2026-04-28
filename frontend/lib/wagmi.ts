"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";

import { skaleBaseSepolia } from "./chain";

export { skaleBaseSepolia };

export const wagmiConfig = getDefaultConfig({
  appName: "Sortes",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "sortes-dev",
  chains: [skaleBaseSepolia],
  ssr: true,
});
