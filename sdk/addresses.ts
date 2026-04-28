// Sortes deployed addresses on SKALE Base Sepolia testnet.
// SPDX-License-Identifier: AGPL-3.0-only

export const CHAIN = {
  name: "SKALE Base Sepolia",
  chainId: 324_705_682,
  rpcUrl: "https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha",
  wsUrl: "wss://base-sepolia-testnet.skalenodes.com/v1/ws/jubilant-horrible-ancha",
  explorer: "https://base-sepolia-testnet-explorer.skalenodes.com",
  nativeToken: "CREDIT",
  faucet: "https://base-sepolia-faucet.skale.space",
  bridgePortal: "https://base-sepolia.skalenodes.com",
} as const;

export const ADDRESSES = {
  // Sortes core
  SealedPool: "0x04DFB8B3A9ed4017151f5f1a4427eD51cF02C589",
  // Confidential collateral
  ConfidentialWrapper_cUSDC: "0xEbf27A9A2C38308209F912329Da4b6bFe78DB8fb",
  AccessManager: "0x0556EE147C56627565Bf681eDeC27aE92275A905",
  // Bridged tokens
  USDC_e: "0x2e08028E3C4c2356572E096d8EF835cD5C6030bD",
  WBTC: "0x4512eacd4186b025186e1cf6cc0d89497c530e87",
  WETH: "0xf94056bd7f6965db3757e1b145f200b7346b4fc0",
  ETHC: "0xD2Aaa00700000000000000000000000000000000",
  Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;

// Canonical SKALE BITE precompile addresses.
export const BITE_PRECOMPILES = {
  submitCTX: "0x000000000000000000000000000000000000001B",
  encryptECIES: "0x000000000000000000000000000000000000001C",
  encryptTE: "0x000000000000000000000000000000000000001D",
} as const;
