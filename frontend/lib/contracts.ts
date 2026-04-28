// Address constants + ABI imports for the Sortes frontend.
// Copies of the SDK's addresses to avoid import-cross-package issues.

import SealedPoolAbi from "../../abi/SealedPool.json";

export const ADDRESSES = {
  SealedPool: "0x04DFB8B3A9ed4017151f5f1a4427eD51cF02C589" as `0x${string}`,
  ConfidentialWrapper_cUSDC: "0xEbf27A9A2C38308209F912329Da4b6bFe78DB8fb" as `0x${string}`,
  USDC_e: "0x2e08028E3C4c2356572E096d8EF835cD5C6030bD" as `0x${string}`,
} as const;

export const SEALED_POOL_ABI = SealedPoolAbi as readonly unknown[];

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export enum MarketStatus {
  None = 0,
  Open = 1,
  AwaitingOracle = 2,
  AwaitingDecryption = 3,
  Triggered = 4,
  Resolved = 5,
  Cancelled = 6,
}

export const MarketStatusLabel: Record<MarketStatus, string> = {
  [MarketStatus.None]: "None",
  [MarketStatus.Open]: "Open",
  [MarketStatus.AwaitingOracle]: "Awaiting oracle",
  [MarketStatus.AwaitingDecryption]: "Ready to resolve",
  [MarketStatus.Triggered]: "Resolving",
  [MarketStatus.Resolved]: "Resolved",
  [MarketStatus.Cancelled]: "Cancelled",
};
