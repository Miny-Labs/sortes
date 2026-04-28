import { defineChain } from "viem";

export const skaleBaseSepolia = defineChain({
  id: 324_705_682,
  name: "SKALE Base Sepolia",
  nativeCurrency: { name: "CREDIT", symbol: "CREDIT", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha"],
    },
  },
  blockExplorers: {
    default: {
      name: "SKALE Base Sepolia Explorer",
      url: "https://base-sepolia-testnet-explorer.skalenodes.com",
    },
  },
  testnet: true,
});
