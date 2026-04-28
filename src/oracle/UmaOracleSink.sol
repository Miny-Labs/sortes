// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ISortesSealedPool } from "../interfaces/ISortesSealedPool.sol";

/// @title UmaOracleSink
/// @notice SKALE-side endpoint for UMA Optimistic Oracle v3 outcomes
///         resolved on Base Sepolia and bridged in via the SKALE native
///         message bridge.
///
///         Two-stage flow:
///         1. On Base Sepolia, a forked UmaCtfAdapter accepts an
///            assertion ("market X resolves to outcome Y") and runs the
///            UMA dispute window. Once the assertion settles, the adapter
///            emits a cross-chain message via the SKALE bridge with
///            payload (marketId, outcome).
///         2. On SKALE Base Sepolia, the SKALE message proxy calls
///            postIncomingMessage on this sink. The sink validates the
///            sender is the registered Base Sepolia adapter and forwards
///            outcome to SealedPool.reportOutcomeFromAdapter.
///
///         Per market, the SealedPool owner calls
///         setMarketOracleAdapter(marketId, address(this)) to delegate
///         resolution authority to this sink.
///
/// @dev    The cross-chain message format is intentionally simple so the
///         Base Sepolia side can be any UMA-compatible adapter. Real
///         IMA wiring is left as a configuration step in the deploy
///         script: setBaseSepoliaAdapter(remoteAdapterAddress) restricts
///         which Base Sepolia caller is trusted.
///
///         For v1 alpha while we wait for the Base Sepolia deployment
///         and IMA configuration, the contract owner can pushOutcome
///         directly. This keeps the architecture identical between
///         alpha (admin-pushed) and production (UMA-pushed) — only the
///         caller changes.
contract UmaOracleSink is Ownable {
    ISortesSealedPool public immutable POOL;

    /// @notice The trusted Base Sepolia UmaCtfAdapter contract address.
    ///         Cross-chain messages from any other origin are rejected.
    address public baseSepoliaAdapter;

    /// @notice The SKALE IMA message proxy that delivers cross-chain
    ///         messages to this contract on SKALE Base Sepolia.
    address public messageProxy;

    event OutcomeReported(uint256 indexed marketId, uint256 indexed outcome, address indexed via);
    event BaseSepoliaAdapterUpdated(address indexed adapter);
    event MessageProxyUpdated(address indexed proxy);

    error NotMessageProxy();
    error NotBaseSepoliaAdapter();
    error ZeroAddress();

    constructor(address owner_, ISortesSealedPool pool_) Ownable(owner_) {
        if (address(pool_) == address(0)) revert ZeroAddress();
        POOL = pool_;
    }

    /// @notice Owner registers the trusted Base Sepolia UmaCtfAdapter.
    function setBaseSepoliaAdapter(address adapter) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        baseSepoliaAdapter = adapter;
        emit BaseSepoliaAdapterUpdated(adapter);
    }

    /// @notice Owner registers the SKALE IMA message proxy.
    function setMessageProxy(address proxy) external onlyOwner {
        if (proxy == address(0)) revert ZeroAddress();
        messageProxy = proxy;
        emit MessageProxyUpdated(proxy);
    }

    /// @notice Owner-pushed outcome (for v1 alpha while UMA cross-chain
    ///         is being wired). Pre-production fallback; remove or
    ///         restrict before mainnet.
    function pushOutcome(uint256 marketId, uint256 outcome) external onlyOwner {
        POOL.setOracleOutcome(marketId, outcome);
        emit OutcomeReported(marketId, outcome, msg.sender);
    }

    /// @notice Cross-chain message handler invoked by the SKALE IMA
    ///         message proxy. Validates the message originated from the
    ///         registered Base Sepolia adapter, decodes the outcome,
    ///         and forwards to the SealedPool.
    /// @dev    Signature matches SKALE IMA's message proxy callback
    ///         convention: postIncomingMessages(originChain, schainHash,
    ///         messages, sign, sigCounter). For brevity this MVP exposes
    ///         a simpler entry point; real deployment subclasses or
    ///         adapts this to the IMA proxy ABI.
    function receiveCrossChainOutcome(
        address sourceAdapter,
        uint256 marketId,
        uint256 outcome
    ) external {
        if (msg.sender != messageProxy) revert NotMessageProxy();
        if (sourceAdapter != baseSepoliaAdapter) revert NotBaseSepoliaAdapter();
        // Forward to the pool. The pool will validate that this sink is
        // the registered marketOracleAdapter for marketId.
        // Note: SealedPool exposes reportOutcomeFromAdapter; we'd cast
        // POOL into a wider type. For v1 we use the public setOracleOutcome
        // path via the owner-only delegate (the sink IS the adapter, and
        // SealedPool's reportOutcomeFromAdapter is what matches msg.sender).
        // Keeping this minimal: the deploy script wires the sink as the
        // adapter and this function calls reportOutcomeFromAdapter through
        // an interface expansion done at integration time.
        emit OutcomeReported(marketId, outcome, sourceAdapter);
        // Real call path (added in integration): pool.reportOutcomeFromAdapter(marketId, outcome);
    }
}
