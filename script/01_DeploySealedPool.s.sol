// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { SealedPool } from "../src/SealedPool.sol";

/// @notice Deploys SealedPool to the configured network. Owner = deployer,
///         treasury = deployer (both can be rotated post-deploy).
///
/// Usage:
///   source .env
///   forge script script/01_DeploySealedPool.s.sol:DeploySealedPool \
///     --rpc-url $SKALE_BASE_SEPOLIA_RPC \
///     --broadcast \
///     --verify --verifier blockscout \
///     --verifier-url $SKALE_BASE_SEPOLIA_VERIFIER_URL
contract DeploySealedPool is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = deployer; // testnet: same address for owner + treasury

        console2.log("Deployer:", deployer);
        console2.log("Treasury:", treasury);
        console2.log("Chain id:", block.chainid);

        vm.startBroadcast(pk);
        SealedPool pool = new SealedPool(deployer, treasury);
        vm.stopBroadcast();

        console2.log("SealedPool deployed at:", address(pool));
        console2.log("submitCTXAddress (default precompile):", pool.submitCTXAddress());
        console2.log("callbackFee (wei):", pool.callbackFee());
        console2.log("callbackGasLimit:", pool.callbackGasLimit());
        console2.log("protocolFeeBps:", pool.protocolFeeBps());
        console2.log("maxBetsPerMarket:", pool.maxBetsPerMarket());
    }
}
