// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

/// @title IResolutionOracle
/// @notice Adapter interface for an external resolution authority (e.g.
///         a UMA Optimistic Oracle bridged from Base Sepolia, a Reality.eth
///         arbiter, or a permissioned operator multisig). The SealedPool
///         allows the owner to delegate the right to call setOracleOutcome
///         per market to one of these adapters, so resolution can be
///         decentralized without touching the pool's audited core logic.
/// @dev    The adapter is responsible for:
///         - establishing outcome correctness (running the optimistic
///           oracle game, dispute resolution, cross-chain message verify)
///         - calling pool.reportOutcomeFromAdapter(marketId, outcome) once
interface IResolutionOracle {
    /// @notice Reports a verified outcome for a market.
    /// @dev    Called BY the adapter ON the SealedPool. Implementations of
    ///         this interface live in the adapter contract and decide when
    ///         to forward to the pool. The pool itself does not call this.
    /// @param marketId The market identifier.
    /// @param outcome The resolved outcome index.
    function reportOutcome(uint256 marketId, uint256 outcome) external;
}
