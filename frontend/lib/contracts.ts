import type { Abi } from "viem";
import SealedPoolAbi from "../../abi/SealedPool.json";

export const ADDRESSES = {
  SealedPool: "0x04DFB8B3A9ed4017151f5f1a4427eD51cF02C589" as `0x${string}`,
  ConfidentialWrapper_cUSDC: "0xEbf27A9A2C38308209F912329Da4b6bFe78DB8fb" as `0x${string}`,
  USDC_e: "0x2e08028E3C4c2356572E096d8EF835cD5C6030bD" as `0x${string}`,
} as const;

export const SEALED_POOL_ABI = SealedPoolAbi as Abi;

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
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const CONFIDENTIAL_WRAPPER_ABI = [
  {
    name: "depositFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "withdrawTo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "encryptedBalanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ name: "encryptedBalance", type: "bytes" }],
  },
  {
    name: "ethBalanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [],
  },
  {
    name: "registerPublicKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "publicKey",
        type: "tuple",
        components: [
          { name: "x", type: "bytes32" },
          { name: "y", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
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

export const EXPLORER_URL = "https://base-sepolia-testnet-explorer.skalenodes.com";
