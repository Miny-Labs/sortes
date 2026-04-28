// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

// Force-import contracts we want Foundry to compile so we can `forge create`
// them for testnet deployment, even though they live under lib/ (the normal
// Foundry compile path) or are siblings to the unit tests.
//
// This file has no behaviour. It only exists so the compiler emits artifacts.

import { BiteMock }      from "@skalenetwork/bite-solidity/test/BiteMock.sol";
import { SubmitCTXMock } from "@skalenetwork/bite-solidity/test/SubmitCTXMock.sol";
import { IdentityCTX }   from "./IdentityCTX.sol";
import { MockUSDC }      from "./MockUSDC.sol";
