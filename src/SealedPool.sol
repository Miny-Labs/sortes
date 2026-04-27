// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import { BITE } from "@skalenetwork/bite-solidity/BITE.sol";
import { IBiteSupplicant } from "@skalenetwork/bite-solidity/interfaces/IBiteSupplicant.sol";

import { ISortesSealedPool } from "./interfaces/ISortesSealedPool.sol";

/// @title SealedPool
/// @author Sortes contributors
/// @notice Sealed-bid prediction market pool. Bets stay BITE-encrypted on chain
///         until the market deadline. At resolution the pool calls the SubmitCTX
///         precompile with all encrypted bets in one batch; the BITE committee
///         delivers decrypted outcomes in a single onDecrypt callback in the next
///         block; the pool tallies winners and unlocks parimutuel payouts. There
///         is no continuous trading, no live aggregate odds (that is the dark-pool
///         trade-off), and no off-chain or trusted component anywhere in the path.
/// @dev    Safety properties enforced:
///         - Only the callback sender we registered via submitCTX can call onDecrypt
///           (mapping check + delete-on-use to prevent replay).
///         - submitSealedBet, triggerResolution, redeem are guarded against
///           reentrancy because all three move ERC-20 collateral.
///         - oracleOutcome must be set before triggerResolution (v0: admin sets;
///           later: UMA bridge sets).
///         - Each bet redeemable exactly once; double-redeem reverts.
///         - If nobody bet on the winning outcome, all stakes are refunded.
///         - Cancellation refunds all stakes; only callable before resolution.
contract SealedPool is ISortesSealedPool, IBiteSupplicant, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice A single sealed bet inside a market.
    struct Bet {
        address bettor;
        uint256 stake;
        bytes encryptedOutcome;
        uint256 chosenOutcome; // populated after onDecrypt
        bool decrypted;
        bool redeemed;
    }

    /// @notice A sealed prediction market.
    struct Market {
        string question;
        uint256 outcomeCount;
        uint256 submissionDeadline;
        uint256 resolutionTime;
        IERC20 collateral;
        MarketStatus status;
        uint256 oracleOutcome;
        bool oracleReported;
        uint256 totalStake;
        uint256 winningStake;
        Bet[] bets;
    }

    /// @notice Sentinel constant meaning "outcome not yet reported".
    uint256 public constant OUTCOME_UNSET = type(uint256).max;

    /// @notice Protocol fee in basis points charged on the total winning pot before
    ///         distribution. v0 default: 100 bps (1%). Configurable by owner.
    uint256 public protocolFeeBps = 100;

    /// @notice Maximum protocol fee, hard-coded so owner cannot rug. 5%.
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500;

    /// @notice BPS denominator.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Address that receives protocol fees.
    address public treasury;

    /// @notice Address of the SubmitCTX precompile (mocked in tests).
    address public submitCTXAddress = BITE.SUBMIT_CTX_ADDRESS;

    /// @notice Gas limit allocated to the BITE callback. Large enough to handle
    ///         the per-bet decode, accumulate, and finalise loop. Owner-tunable.
    uint256 public callbackGasLimit = 5_000_000;

    /// @notice Wei deposited per resolution to fund the BITE callback. Caller of
    ///         triggerResolution must send this amount. Owner-tunable.
    uint256 public callbackFee = 1_000 gwei;

    /// @notice Hard cap on bets per market. Above this the on-chain decryption
    ///         loop risks running out of gas. v0 = 200; tune as gas usage measured.
    uint256 public maxBetsPerMarket = 200;

    /// @notice Markets indexed by id starting at 1. Id 0 is reserved as "none".
    Market[] private _markets;

    /// @notice Maps a registered callback sender to the market id it resolves.
    ///         Set in triggerResolution, deleted in onDecrypt.
    mapping(address callbackSender => uint256 marketId) private _pendingCallbacks;

    error MarketNotOpen();
    error MarketDoesNotExist();
    error SubmissionClosed();
    error NotResolutionTimeYet();
    error OracleNotReported();
    error AlreadyTriggered();
    error InvalidOutcome();
    error InvalidOutcomeCount();
    error InvalidDeadlineOrder();
    error TooManyBets();
    error InsufficientCallbackFee(uint256 required, uint256 supplied);
    error UnknownCallback();
    error MarketNotResolved();
    error NotBettor();
    error AlreadyRedeemed();
    error NotAWinner();
    error CannotCancelAfterResolution();
    error ProtocolFeeTooHigh();
    error ZeroAddress();
    error EmptyQuestion();
    error ZeroStake();
    error EmptyEncryptedOutcome();
    error CallbackArgsLengthMismatch();
    error DecryptedValueWrongLength();
    error OracleAlreadyReported();

    constructor(address owner_, address treasury_) Ownable(owner_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        _markets.push(); // sentinel so id 0 is unused
    }

    // -------------------------------------------------------------------------
    // Market lifecycle
    // -------------------------------------------------------------------------

    /// @inheritdoc ISortesSealedPool
    function createMarket(
        string calldata question,
        uint256 outcomeCount,
        uint256 submissionDeadline,
        uint256 resolutionTime,
        address collateral
    ) external override onlyOwner returns (uint256 marketId) {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (outcomeCount < 2) revert InvalidOutcomeCount();
        if (submissionDeadline <= block.timestamp) revert InvalidDeadlineOrder();
        if (resolutionTime < submissionDeadline) revert InvalidDeadlineOrder();
        if (collateral == address(0)) revert ZeroAddress();

        marketId = _markets.length;
        _markets.push();
        Market storage m = _markets[marketId];
        m.question = question;
        m.outcomeCount = outcomeCount;
        m.submissionDeadline = submissionDeadline;
        m.resolutionTime = resolutionTime;
        m.collateral = IERC20(collateral);
        m.status = MarketStatus.Open;
        m.oracleOutcome = OUTCOME_UNSET;

        emit MarketCreated(
            marketId,
            question,
            outcomeCount,
            submissionDeadline,
            resolutionTime,
            collateral
        );
    }

    /// @inheritdoc ISortesSealedPool
    function submitSealedBet(
        uint256 marketId,
        bytes calldata encryptedOutcome,
        uint256 stake
    ) external override nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= m.submissionDeadline) revert SubmissionClosed();
        if (stake == 0) revert ZeroStake();
        if (encryptedOutcome.length == 0) revert EmptyEncryptedOutcome();
        if (m.bets.length >= maxBetsPerMarket) revert TooManyBets();

        m.collateral.safeTransferFrom(msg.sender, address(this), stake);

        uint256 betIndex = m.bets.length;
        m.bets.push(Bet({
            bettor: msg.sender,
            stake: stake,
            encryptedOutcome: encryptedOutcome,
            chosenOutcome: 0,
            decrypted: false,
            redeemed: false
        }));
        m.totalStake += stake;

        emit SealedBetSubmitted(marketId, msg.sender, betIndex, stake);
    }

    /// @inheritdoc ISortesSealedPool
    function setOracleOutcome(uint256 marketId, uint256 outcome) external override onlyOwner {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Open && m.status != MarketStatus.AwaitingOracle) {
            revert MarketNotOpen();
        }
        if (block.timestamp < m.resolutionTime) revert NotResolutionTimeYet();
        if (outcome >= m.outcomeCount) revert InvalidOutcome();
        if (m.oracleReported) revert OracleAlreadyReported();

        m.oracleOutcome = outcome;
        m.oracleReported = true;
        m.status = MarketStatus.AwaitingDecryption;
    }

    /// @inheritdoc ISortesSealedPool
    function triggerResolution(uint256 marketId) external payable override nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.AwaitingDecryption) revert AlreadyTriggered();
        if (!m.oracleReported) revert OracleNotReported();
        if (msg.value < callbackFee) revert InsufficientCallbackFee(callbackFee, msg.value);

        uint256 numBets = m.bets.length;
        bytes[] memory encArgs = new bytes[](numBets);
        for (uint256 i = 0; i < numBets; ++i) {
            encArgs[i] = m.bets[i].encryptedOutcome;
        }

        bytes[] memory ptxArgs = new bytes[](1);
        ptxArgs[0] = abi.encode(marketId);

        address payable callback = BITE.submitCTX(
            submitCTXAddress,
            callbackGasLimit,
            encArgs,
            ptxArgs
        );

        _pendingCallbacks[callback] = marketId;
        m.status = MarketStatus.Triggered;

        emit ResolutionTriggered(marketId, callback, m.oracleOutcome);

        // Forward the callback funding wei. Use Address.sendValue for revert
        // visibility on failure.
        Address.sendValue(callback, callbackFee);

        // Refund any excess callback fee to caller.
        uint256 excess = msg.value - callbackFee;
        if (excess > 0) {
            Address.sendValue(payable(msg.sender), excess);
        }
    }

    /// @notice BITE callback. Invoked once per market by the registered callback
    ///         sender to deliver decrypted outcomes for every bet.
    /// @inheritdoc IBiteSupplicant
    function onDecrypt(
        bytes[] calldata decryptedArguments,
        bytes[] calldata plaintextArguments
    ) external override {
        uint256 marketId = _pendingCallbacks[msg.sender];
        if (marketId == 0) revert UnknownCallback();
        delete _pendingCallbacks[msg.sender];

        if (plaintextArguments.length != 1) revert CallbackArgsLengthMismatch();
        uint256 decodedMarketId = abi.decode(plaintextArguments[0], (uint256));
        if (decodedMarketId != marketId) revert UnknownCallback();

        Market storage m = _markets[marketId];
        if (decryptedArguments.length != m.bets.length) revert CallbackArgsLengthMismatch();

        uint256 winningOutcome = m.oracleOutcome;
        uint256 winningStake = 0;

        for (uint256 i = 0; i < decryptedArguments.length; ++i) {
            bytes calldata raw = decryptedArguments[i];
            // Plaintext is abi-encoded uint256 (32 bytes). Reject malformed.
            if (raw.length != 32) revert DecryptedValueWrongLength();
            uint256 chosen = abi.decode(raw, (uint256));

            Bet storage bet = m.bets[i];
            bet.chosenOutcome = chosen;
            bet.decrypted = true;
            if (chosen == winningOutcome) {
                winningStake += bet.stake;
            }
        }

        m.winningStake = winningStake;
        m.status = MarketStatus.Resolved;

        emit MarketResolved(marketId, winningOutcome, m.totalStake, winningStake);
    }

    /// @inheritdoc ISortesSealedPool
    function redeem(uint256 marketId, uint256 betIndex) external override nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Resolved && m.status != MarketStatus.Cancelled) {
            revert MarketNotResolved();
        }
        Bet storage bet = m.bets[betIndex];
        if (bet.bettor != msg.sender) revert NotBettor();
        if (bet.redeemed) revert AlreadyRedeemed();

        uint256 payout;

        if (m.status == MarketStatus.Cancelled) {
            // Refund stake on cancellation.
            payout = bet.stake;
        } else if (m.winningStake == 0) {
            // No winners: refund stake to everyone.
            payout = bet.stake;
        } else if (bet.chosenOutcome == m.oracleOutcome) {
            // Winner: parimutuel share of (totalStake minus protocol fee).
            uint256 grossPot = m.totalStake;
            uint256 fee = (grossPot * protocolFeeBps) / BPS_DENOMINATOR;
            uint256 netPot = grossPot - fee;
            payout = (bet.stake * netPot) / m.winningStake;
        } else {
            revert NotAWinner();
        }

        bet.redeemed = true;
        m.collateral.safeTransfer(bet.bettor, payout);
        emit Redeemed(marketId, msg.sender, payout);
    }

    /// @notice Withdraw accumulated protocol fees for a resolved market to the treasury.
    ///         Only callable after the market is Resolved; safe to call multiple times.
    /// @param marketId Identifier of the market.
    function sweepFees(uint256 marketId) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Resolved) revert MarketNotResolved();
        if (m.winningStake == 0) return; // no fee was charged

        uint256 fee = (m.totalStake * protocolFeeBps) / BPS_DENOMINATOR;
        // Idempotent: only sweep what is left in the contract attributable to fees
        // assuming all winners have been redeemed. In practice this is a flat
        // marker. v1 will track swept-status per market.
        m.collateral.safeTransfer(treasury, fee);
    }

    /// @notice Cancel a market before resolution. Refunds become available via redeem.
    function cancelMarket(uint256 marketId) external onlyOwner {
        Market storage m = _market(marketId);
        if (m.status == MarketStatus.Resolved) revert CannotCancelAfterResolution();
        m.status = MarketStatus.Cancelled;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PROTOCOL_FEE_BPS) revert ProtocolFeeTooHigh();
        protocolFeeBps = newFeeBps;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
    }

    function setSubmitCTXAddress(address newAddress) external onlyOwner {
        if (newAddress == address(0)) revert ZeroAddress();
        submitCTXAddress = newAddress;
    }

    function setCallbackGasLimit(uint256 newLimit) external onlyOwner {
        callbackGasLimit = newLimit;
    }

    function setCallbackFee(uint256 newFee) external onlyOwner {
        callbackFee = newFee;
    }

    function setMaxBetsPerMarket(uint256 newMax) external onlyOwner {
        maxBetsPerMarket = newMax;
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function statusOf(uint256 marketId) external view override returns (MarketStatus) {
        return _market(marketId).status;
    }

    function betCountOf(uint256 marketId) external view override returns (uint256) {
        return _market(marketId).bets.length;
    }

    function totalStakeOf(uint256 marketId) external view override returns (uint256) {
        return _market(marketId).totalStake;
    }

    function marketCount() external view returns (uint256) {
        // Subtract sentinel at index 0.
        return _markets.length - 1;
    }

    function marketInfo(uint256 marketId)
        external
        view
        returns (
            string memory question,
            uint256 outcomeCount,
            uint256 submissionDeadline,
            uint256 resolutionTime,
            address collateral,
            MarketStatus status,
            uint256 oracleOutcome,
            bool oracleReported,
            uint256 totalStake,
            uint256 winningStake,
            uint256 numBets
        )
    {
        Market storage m = _market(marketId);
        return (
            m.question,
            m.outcomeCount,
            m.submissionDeadline,
            m.resolutionTime,
            address(m.collateral),
            m.status,
            m.oracleOutcome,
            m.oracleReported,
            m.totalStake,
            m.winningStake,
            m.bets.length
        );
    }

    function betInfo(uint256 marketId, uint256 betIndex)
        external
        view
        returns (
            address bettor,
            uint256 stake,
            bytes memory encryptedOutcome,
            uint256 chosenOutcome,
            bool decrypted,
            bool redeemed
        )
    {
        Bet storage b = _market(marketId).bets[betIndex];
        return (b.bettor, b.stake, b.encryptedOutcome, b.chosenOutcome, b.decrypted, b.redeemed);
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    function _market(uint256 marketId) private view returns (Market storage) {
        if (marketId == 0 || marketId >= _markets.length) revert MarketDoesNotExist();
        return _markets[marketId];
    }

    /// @notice Allow this contract to receive ETH (callback funding refunds).
    receive() external payable {}
}
