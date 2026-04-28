// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import { Script, console2 } from "forge-std/Script.sol";
import { SealedPool } from "../src/SealedPool.sol";

/// @notice Deploys SealedPool v2 (Phase 2 + Phase 3) to the configured network.
///         Owner = treasury = deployer. Constructor seeds the BITE CTX reserve
///         with MIN_CTX_RESERVE_CALLBACKS * ctxCallbackValueWei worth of native
///         token (CREDIT on SKALE Base / SKALE Base Sepolia).
///
/// Usage:
///   source .env
///   CTX_CALLBACK_VALUE_WEI=60000000000000000 \
///   forge script script/01_DeploySealedPool.s.sol:DeploySealedPool \
///     --rpc-url $SKALE_BASE_SEPOLIA_RPC \
///     --broadcast --legacy
contract DeploySealedPool is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = deployer;

        // 0.06 ETH/CREDIT per CTX is the canonical SKALE recommendation
        // from the programmable-privacy skill. Override via env if needed
        // (e.g. for testnets where CREDIT supply is constrained).
        uint256 ctxCallbackValueWei = vm.envOr("CTX_CALLBACK_VALUE_WEI", uint256(0.06 ether));
        uint256 reserveAmount = ctxCallbackValueWei * 10; // MIN_CTX_RESERVE_CALLBACKS

        console2.log("Deployer:", deployer);
        console2.log("Treasury:", treasury);
        console2.log("Chain id:", block.chainid);
        console2.log("ctxCallbackValueWei:", ctxCallbackValueWei);
        console2.log("Reserve seed amount (wei):", reserveAmount);

        vm.startBroadcast(pk);
        SealedPool pool = new SealedPool{ value: reserveAmount }(
            deployer, treasury, ctxCallbackValueWei
        );
        vm.stopBroadcast();

        console2.log("SealedPool deployed at:", address(pool));
        console2.log("submitCtxAddress:", pool.submitCtxAddress());
        console2.log("encryptEciesAddress:", pool.encryptEciesAddress());
        console2.log("encryptTeAddress:", pool.encryptTeAddress());
        console2.log("ctxReserve:", pool.ctxReserve());
        console2.log("minimumCtxReserve:", pool.minimumCtxReserve());
        console2.log("protocolFeeBps:", pool.protocolFeeBps());
    }
}
