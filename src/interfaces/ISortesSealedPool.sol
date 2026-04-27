// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.30;

/// @title ISortesSealedPool
/// @author Sortes contributors
/// @notice Interface for the Sortes sealed prediction market pool.
/// @dev Bets are submitted as BITE-encrypted (outcome, amount) tuples, escrowed as
///      ciphertexts on chain, and atomically batch-decrypted at resolution via the
///      SKALE BITE Phase 2 SubmitCTX precompile. No off-chain components, no trusted
///      operators. The pool settles against the same oracle outcome the public AMM
///      uses, so a sealed pool and a public AMM market on the same condition stay
///      mutually consistent.
interface ISortesSealedPool {
    /// @notice Lifecycle of a sealed market.
    enum MarketStatus {
        None,
        Open,
        AwaitingOracle,
        AwaitingDecryption,
        Resolved,
        Cancelled
    }

    /// @notice Emitted when a new sealed market is created.
    /// @param marketId Identifier of the market.
    /// @param question Question text or IPFS pointer to question text.
    /// @param outcomeCount Number of mutually exclusive outcomes (binary = 2).
    /// @param submissionDeadline Unix timestamp after which no new sealed bets can be submitted.
    /// @param resolutionTime Unix timestamp at which `triggerResolution` becomes callable.
    /// @param collateral ERC-20 used for stake and payout. v0 uses USDC.e on SKALE Base Sepolia.
    event MarketCreated(
        uint256 indexed marketId,
        string question,
        uint256 outcomeCount,
        uint256 submissionDeadline,
        uint256 resolutionTime,
        address collateral
    );

    /// @notice Emitted when a sealed bet is accepted.
    /// @param marketId Identifier of the market.
    /// @param bettor Address of the bettor (held in plaintext for payout routing only;
    ///        the bet contents stay encrypted).
    /// @param betIndex Index of the bet inside the market's encrypted bet array.
    /// @param stake Plaintext amount of collateral escrowed for this bet. Stake amount is
    ///        unavoidably visible because it is an ERC-20 transfer; only the chosen outcome
    ///        and the per-outcome breakdown stay encrypted in v0. v0.5 will additionally
    ///        encrypt stake via cUSDC integration.
    event SealedBetSubmitted(
        uint256 indexed marketId,
        address indexed bettor,
        uint256 indexed betIndex,
        uint256 stake
    );

    /// @notice Emitted when batch decryption is triggered at resolution.
    /// @param marketId Identifier of the market.
    /// @param callbackSender Address that will deliver the decrypted bets via onDecrypt.
    /// @param oracleOutcome Resolved outcome index reported by the oracle.
    event ResolutionTriggered(
        uint256 indexed marketId,
        address indexed callbackSender,
        uint256 indexed oracleOutcome
    );

    /// @notice Emitted when a sealed market is fully settled and ready for redemption.
    /// @param marketId Identifier of the market.
    /// @param winningOutcome Resolved outcome index.
    /// @param totalStake Sum of all stakes that participated.
    /// @param winningStake Sum of stakes on the winning outcome.
    event MarketResolved(
        uint256 indexed marketId,
        uint256 indexed winningOutcome,
        uint256 totalStake,
        uint256 winningStake
    );

    /// @notice Emitted when a winner redeems their payout.
    event Redeemed(uint256 indexed marketId, address indexed bettor, uint256 amount);

    /// @notice Submit a BITE-encrypted bet to a sealed market.
    /// @param marketId Identifier of the market.
    /// @param encryptedOutcome BITE TE-encrypted outcome index. Must be encrypted client-side
    ///        with the network's threshold key via the bite-ts library.
    /// @param stake Plaintext stake amount in the market's collateral token. Caller must have
    ///        approved at least `stake` to this contract beforehand.
    function submitSealedBet(
        uint256 marketId,
        bytes calldata encryptedOutcome,
        uint256 stake
    ) external;

    /// @notice Once the resolution time is reached and the oracle has reported, trigger batch
    ///         decryption. In the next block, the BITE committee delivers all decrypted bets
    ///         in a single onDecrypt callback and the contract settles atomically.
    /// @param marketId Identifier of the market.
    function triggerResolution(uint256 marketId) external;

    /// @notice Redeem a winning bet after resolution.
    /// @param marketId Identifier of the market.
    /// @param betIndex Index of the bet to redeem.
    function redeem(uint256 marketId, uint256 betIndex) external;

    /// @notice Read the status of a market.
    function statusOf(uint256 marketId) external view returns (MarketStatus);

    /// @notice Total number of bets submitted to a market (visible by design; only the
    ///         outcome breakdown is hidden).
    function betCountOf(uint256 marketId) external view returns (uint256);

    /// @notice Total stake escrowed in a market across all outcomes.
    function totalStakeOf(uint256 marketId) external view returns (uint256);
}
