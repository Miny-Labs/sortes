// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { BITE } from "@skalenetwork/bite-solidity/BITE.sol";
import { PublicKey } from "@skalenetwork/bite-solidity/types.sol";

/// @notice Direct on-chain probe of BITE precompiles via the library helper.
///         Run as a foundry script to invoke the precompile from the deployer
///         account. If the precompile is alive the result is a >292 byte blob.
contract PrecompileSmoke {
    bytes public lastTECipher;
    bytes public lastECIESCipher;

    function probeTE(uint256 value) external returns (uint256 cipherLen) {
        bytes memory cipher = BITE.encryptTE(BITE.ENCRYPT_TE_ADDRESS, abi.encode(value));
        lastTECipher = cipher;
        cipherLen = cipher.length;
    }

    function probeECIES(uint256 value, bytes32 keyX, bytes32 keyY) external returns (uint256 cipherLen) {
        bytes memory cipher = BITE.encryptECIES(
            BITE.ENCRYPT_ECIES_ADDRESS,
            abi.encode(value),
            PublicKey({ x: keyX, y: keyY })
        );
        lastECIESCipher = cipher;
        cipherLen = cipher.length;
    }
}
