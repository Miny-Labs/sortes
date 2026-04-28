// Wagmi + RainbowKit config for SKALE Base Sepolia.
"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

export const skaleBaseSepolia = defineChain({
  id: 324_705_682,
  name: "SKALE Base Sepolia",
  nativeCurrency: { name: "CREDIT", symbol: "CREDIT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha"] },
  },
  blockExplorers: {
    default: {
      name: "SKALE Base Sepolia Explorer",
      url: "https://base-sepolia-testnet-explorer.skalenodes.com",
    },
  },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: "Sortes",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "sortes-dev",
  chains: [skaleBaseSepolia],
  ssr: true,
});
