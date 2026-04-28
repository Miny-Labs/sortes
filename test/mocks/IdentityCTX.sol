// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import { CallbackSender } from "@skalenetwork/bite-solidity/test/CallbackSender.sol";

/// @notice Identity-encryption mock for the SubmitCTX precompile.
/// @dev    For testnet smoke testing of SealedPool when the real BITE Phase 2
///         precompiles (0x1B, 0x1C, 0x1D) are not yet deployed on the chain.
///         Treats encrypted arguments as plaintext, no actual decryption. Cheap
///         enough to fit in any block. The full BiteMock stack from
///         skalenetwork/bite-solidity is correct but uses per-byte keccak loops
///         that exhaust gas on SKALE Base Sepolia. This contract preserves the
///         CTX -> callback -> onDecrypt lifecycle so the SealedPool flow can be
///         demonstrated end to end live.
///
///         Replaceable: when real precompiles ship, the SealedPool owner calls
///         setSubmitCTXAddress(0x1B) and switches to real threshold encryption
///         in a single transaction. No code change required.
contract IdentityCTX {
    event CallbackQueued(address indexed sender, uint256 numEncArgs, uint256 numPtxArgs);

    address[] public queuedCallbacks;

    /// @notice Number of callbacks waiting to be fired.
    function pendingCallbacks() external view returns (uint256) {
        return queuedCallbacks.length;
    }

    /// @notice Mimics the SubmitCTX precompile ABI: payload is
    ///         abi.encode(uint256 gasLimit, bytes innerEncoded) where
    ///         innerEncoded is abi.encode(bytes[] encArgs, bytes[] ptxArgs).
    ///         Returns 20 bytes containing the callback sender address.
    fallback(bytes calldata callData) external returns (bytes memory) {
        (uint256 gasLimit, bytes memory inner) = abi.decode(callData, (uint256, bytes));
        (bytes[] memory encArgs, bytes[] memory ptxArgs) =
            abi.decode(inner, (bytes[], bytes[]));

        // Identity "decryption": encrypted args are passed through as plaintext.
        CallbackSender sender = new CallbackSender(msg.sender, gasLimit, encArgs, ptxArgs);
        queuedCallbacks.push(address(sender));
        emit CallbackQueued(address(sender), encArgs.length, ptxArgs.length);

        return abi.encodePacked(bytes20(uint160(address(sender))));
    }

    /// @notice Fires the next queued callback. Anyone can call this; it just
    ///         delivers the predetermined plaintext to the supplicant. In real
    ///         BITE this happens automatically in the next block.
    function fireNextCallback() external {
        require(queuedCallbacks.length > 0, "IdentityCTX: empty queue");
        address sender = queuedCallbacks[queuedCallbacks.length - 1];
        queuedCallbacks.pop();
        CallbackSender(payable(sender)).sendCallback();
    }

    receive() external payable {}
}
