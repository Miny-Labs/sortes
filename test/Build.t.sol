// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import { Test } from "forge-std/Test.sol";
import { BITE } from "@skalenetwork/bite-solidity/BITE.sol";
import { PublicKey } from "@skalenetwork/bite-solidity/types.sol";
import { IBiteSupplicant } from "@skalenetwork/bite-solidity/interfaces/IBiteSupplicant.sol";
import { ISortesSealedPool } from "../src/interfaces/ISortesSealedPool.sol";

/// @notice Sanity-check that all upstream remappings resolve and the project compiles
///         end to end. This test does not exercise contract behaviour. It exists so a
///         broken submodule or a wrong remapping is caught the moment it lands.
contract BuildSanityTest is Test {
    function test_PrecompileAddressesMatchDocs() public pure {
        // BITE precompile addresses are part of the SKALE BITE Phase 2 spec.
        // Sourced from confidential-token/contracts/Precompiled docs.
        assertEq(BITE.SUBMIT_CTX_ADDRESS, address(0x1B));
        assertEq(BITE.ENCRYPT_ECIES_ADDRESS, address(0x1C));
        assertEq(BITE.ENCRYPT_TE_ADDRESS, address(0x1D));
    }

    function test_PublicKeyStructIsImported() public pure {
        PublicKey memory k = PublicKey({ x: bytes32(uint256(1)), y: bytes32(uint256(2)) });
        assertEq(uint256(k.x), 1);
        assertEq(uint256(k.y), 2);
    }

    function test_SortesInterfacesCompile() public pure {
        // Reference the enum so the compiler keeps the symbol live.
        ISortesSealedPool.MarketStatus s = ISortesSealedPool.MarketStatus.Open;
        assertEq(uint256(s), 1);
    }

    function test_SupplicantInterfaceIsImported() public pure {
        // Interface symbol must resolve. We do not call it.
        bytes4 sel = IBiteSupplicant.onDecrypt.selector;
        assertTrue(sel != bytes4(0));
    }
}
