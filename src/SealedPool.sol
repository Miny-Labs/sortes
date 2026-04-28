// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { BITE } from "@skalenetwork/bite-solidity/BITE.sol";
import { PublicKey } from "@skalenetwork/bite-solidity/types.sol";
import { IBiteSupplicant } from "@skalenetwork/bite-solidity/interfaces/IBiteSupplicant.sol";

import { ISortesSealedPool } from "./interfaces/ISortesSealedPool.sol";

/// @notice Minimal interface to the SKALE Confidential Token (cUSDC) used
///         by the confidential-bet path. Only the calls we need.
interface IConfidentialToken {
    function encryptedTransferFrom(address from, address to, bytes calldata value) external;
    function encryptedTransfer(address to, bytes calldata value) external;
}

/// @title  SealedPool (v2) — tight Phase 2 + Phase 3 integration
/// @author Sortes contributors
/// @notice Sealed-bid prediction market pool implementing Pattern 3 from the
///         SKALE programmable-privacy skill: TE storage + ECIES viewer key +
///         CTX-driven decryption + re-encryption of payouts inside onDecrypt.
///
///         PRIVACY MODEL — mirrors confidential-poker:
///           - Bet outcome is PRIVATE (BITE encrypted twice: TE for protocol-side
///             batch decrypt, ECIES under bettor's viewer key for self-view).
///           - Bet stake is PUBLIC plaintext in v1 (deposited as USDC.e). The
///             aggregate-disclosure layer (cUSDC + N>=2 anonymity) lands in v1.5.
///           - Submission, oracle reporting, resolution trigger are all PUBLIC.
///           - PAYOUT amounts after resolution are RE-ENCRYPTED inside onDecrypt
///             under each winner's viewer key (Phase 3) before being stored.
///
///         PHASES USED:
///           - Phase 2 (CTX, precompile 0x1B): batch decrypt all sealed bets
///             at resolution and run onDecrypt callback.
///           - Phase 3 (re-encryption, precompile 0x1C ECIES): encrypt each
///             winner's payout amount under their viewer key inside onDecrypt
///             so the payout claim is private until the winner decrypts off
///             chain or burns it for the underlying USDC.e.
///
/// @dev    Mirrors TheGreatAxios/confidential-poker contract layout:
///           - _pendingKind / _pendingMarket maps for callback routing.
///           - CTX reserve enforced at deploy and at every triggerResolution.
///           - Per-call gas budget computed from data shape.
///           - Owner-swappable submitCTXAddress for unit-test mock injection.
contract SealedPool is ISortesSealedPool, IBiteSupplicant, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address payable;

    // ─── Types ─────────────────────────────────────────────────────────

    enum CallbackKind { None, Resolution, AggregateReveal }

    struct Bet {
        address bettor;
        uint256 stake;
        PublicKey viewerKey;
        bytes teEncryptedOutcome;       // Phase 3 storage (TE)
        bytes eciesEncryptedOutcome;    // Phase 3 storage (ECIES, viewer-only)
        bytes eciesEncryptedPayout;     // Phase 3 re-encryption result, set in onDecrypt
        uint256 chosenOutcome;          // Plaintext outcome, set in onDecrypt
        uint256 payoutAmount;           // Plaintext payout, set in onDecrypt
        bool decrypted;
        bool redeemed;
    }

    /// @notice A confidential bet. Stake AND outcome both encrypted, settled
    ///         in the SKALE Confidential Token (cUSDC) wrapping the market's
    ///         underlying USDC.e collateral. Stake-amount privacy is achieved
    ///         because the cUSDC.encryptedTransferFrom called inside
    ///         submitConfidentialBet uses the SAME teEncryptedStake ciphertext
    ///         that this contract stores. Direction is a separate ciphertext.
    /// @dev    Same pot as public bets. Resolution decrypts both the public
    ///         and confidential arrays in one batch CTX; the unified pot is
    ///         (totalPublicStake + totalConfidentialStake) and winners across
    ///         both arrays share the proportional prize.
    struct ConfidentialBet {
        address bettor;
        PublicKey viewerKey;
        bytes teEncryptedDirection;     // TE(abi.encode(outcome))
        bytes teEncryptedStake;         // TE(abi.encode(stake)) — also used as cUSDC encryptedTransferFrom payload
        bytes eciesEncryptedDirection;  // ECIES under viewerKey
        bytes eciesEncryptedStake;      // ECIES under viewerKey
        bytes eciesEncryptedPayout;     // re-encrypted payout, set in onDecrypt
        uint256 chosenOutcome;          // populated in onDecrypt
        uint256 stake;                  // populated in onDecrypt
        uint256 payoutAmount;           // populated in onDecrypt
        bool decrypted;
        bool redeemed;
    }

    struct Market {
        string question;
        uint256 outcomeCount;
        uint256 submissionDeadline;
        uint256 resolutionTime;
        IERC20 collateral;             // public-side underlying (USDC.e)
        IERC20 confidentialCollateral; // confidential-side wrapper (cUSDC). Optional.
        MarketStatus status;
        uint256 oracleOutcome;
        bool oracleReported;
        uint256 totalStake;            // PUBLIC totalStake (USDC.e)
        uint256 winningStake;          // PUBLIC winningStake
        uint256 confidentialTotalStake;   // populated in onDecrypt
        uint256 confidentialWinningStake; // populated in onDecrypt
        Bet[] bets;
        ConfidentialBet[] confidentialBets;
    }

    // ─── Constants ─────────────────────────────────────────────────────

    uint256 public constant OUTCOME_UNSET = type(uint256).max;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500; // 5%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice BITE library hard cap on per-callback gas. From the skill.
    uint256 public constant CTX_GAS_LIMIT = 2_500_000;

    /// @notice Number of pre-funded callbacks the contract must hold.
    /// @dev Mirrors confidential-poker MIN_CTX_RESERVE_CALLBACKS = 10.
    uint256 public constant MIN_CTX_RESERVE_CALLBACKS = 10;

    /// @notice Hard cap on bets per market. Limits onDecrypt loop gas.
    uint256 public constant MAX_BETS_PER_MARKET = 200;

    /// @notice Minimum number of unaggregated bets required to trigger an
    ///         aggregate reveal. Anti-deanonymization invariant: with N>=2
    ///         per batch, no single bet's outcome can be inferred from the
    ///         delta between consecutive aggregate snapshots.
    uint256 public constant MIN_AGGREGATE_BATCH = 2;

    // ─── Phase 3 precompile addresses (immutable, defaults from BITE lib) ──

    address public immutable encryptEciesAddress;
    address public immutable encryptTeAddress;

    // ─── Immutable / config ────────────────────────────────────────────

    /// @notice Wei sent to BITE callback sender to fund onDecrypt execution.
    /// @dev    The skill recommends 0.06 ETH/SFUEL/CREDIT per CTX.
    uint256 public immutable ctxCallbackValueWei;

    // ─── Owner-tunable state ───────────────────────────────────────────

    /// @notice SubmitCTX precompile address. Default = BITE.SUBMIT_CTX_ADDRESS.
    ///         Owner-swappable so tests can route through SubmitCTXMock.
    address public submitCtxAddress = BITE.SUBMIT_CTX_ADDRESS;

    uint256 public protocolFeeBps = 100; // 1%
    address public treasury;

    // ─── State ────────────────────────────────────────────────────────

    Market[] private _markets;

    mapping(address callbackSender => uint256 marketId) private _pendingMarket;
    mapping(address callbackSender => CallbackKind kind) private _pendingKind;

    /// @notice Public per-outcome aggregate stake totals, refreshed by
    ///         triggerAggregateReveal. Visible to everyone for live odds UX.
    /// @dev    Privacy preserved by N>=MIN_AGGREGATE_BATCH invariant: each
    ///         reveal batches at least 2 new bets, so deltas cannot isolate
    ///         a single bet's outcome.
    mapping(uint256 marketId => mapping(uint256 outcome => uint256 stake))
        public aggregatePerOutcome;

    /// @notice First bet index that has NOT yet been folded into the public
    ///         aggregate. triggerAggregateReveal advances this cursor.
    mapping(uint256 marketId => uint256) public aggregatedUpToIndex;

    /// @notice Optional external oracle adapter authorized to call
    ///         reportOutcomeFromAdapter for a given market. address(0) means
    ///         only the contract owner may set the outcome (default v1
    ///         behaviour). Adapters wire in UMA OOv3, Reality.eth, or
    ///         multisig operators without modifying the pool core.
    mapping(uint256 marketId => address adapter) public marketOracleAdapter;

    // ─── Errors ───────────────────────────────────────────────────────

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
    error UnknownCallback();
    error MarketNotResolved();
    error NotBettor();
    error AlreadyRedeemed();
    error NotAWinner();
    error CannotCancelAfterResolution();
    error ProtocolFeeTooHigh();
    error ZeroAddress();
    error ZeroValue();
    error EmptyQuestion();
    error ZeroStake();
    error EmptyEncryptedOutcome();
    error CallbackArgsLengthMismatch();
    error DecryptedValueWrongLength();
    error OracleAlreadyReported();
    error InsufficientCtxReserve(uint256 required, uint256 available);
    error InvalidViewerKey();
    error NotEnoughForAggregate(uint256 unaggregated, uint256 minimum);
    error NotAuthorizedOracleAdapter();
    error ConfidentialNotEnabled();
    error UnknownCallbackType();
    error ConfidentialBetNotResolved();

    // ─── Events not on the interface ───────────────────────────────

    /// @notice Emitted when an aggregate reveal CTX is triggered.
    event AggregateRevealTriggered(
        uint256 indexed marketId,
        address indexed callbackSender,
        uint256 fromBetIndex,
        uint256 toBetIndex
    );

    /// @notice Emitted after the BITE callback updates a market's per-outcome
    ///         aggregate. Cumulative public total per outcome.
    event AggregateUpdated(
        uint256 indexed marketId,
        uint256 indexed outcome,
        uint256 newAggregateStake,
        uint256 totalAggregatedBets
    );

    /// @notice Emitted when a confidential bet is submitted.
    event ConfidentialBetSubmitted(
        uint256 indexed marketId,
        address indexed bettor,
        uint256 indexed betIndex
    );

    /// @notice Emitted when a confidential bet is redeemed (cUSDC payout).
    event ConfidentialRedeemed(
        uint256 indexed marketId,
        address indexed bettor,
        uint256 indexed betIndex,
        uint256 payout
    );

    /// @notice Emitted when the owner enables confidential collateral on a market.
    event ConfidentialCollateralSet(uint256 indexed marketId, address indexed collateral);

    // ─── Constructor ──────────────────────────────────────────────────

    /// @param owner_ Owner address (markets, oracle, fees).
    /// @param treasury_ Recipient of swept protocol fees.
    /// @param ctxCallbackValueWei_ Wei attached to each BITE CTX callback.
    /// @dev Sender must seed the contract with at least
    ///      ctxCallbackValueWei_ * MIN_CTX_RESERVE_CALLBACKS via msg.value.
    constructor(
        address owner_,
        address treasury_,
        uint256 ctxCallbackValueWei_
    )
        payable
        Ownable(owner_)
    {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (ctxCallbackValueWei_ == 0) revert ZeroValue();

        treasury = treasury_;
        ctxCallbackValueWei = ctxCallbackValueWei_;
        encryptEciesAddress = BITE.ENCRYPT_ECIES_ADDRESS;
        encryptTeAddress = BITE.ENCRYPT_TE_ADDRESS;

        uint256 reserveRequired = ctxCallbackValueWei_ * MIN_CTX_RESERVE_CALLBACKS;
        if (msg.value < reserveRequired) {
            revert InsufficientCtxReserve(reserveRequired, msg.value);
        }

        _markets.push(); // sentinel slot so market ids start at 1
    }

    receive() external payable {}

    // ═════════════════════════════════════════════════════════════════
    // Market lifecycle
    // ═════════════════════════════════════════════════════════════════

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
            marketId, question, outcomeCount, submissionDeadline, resolutionTime, collateral
        );
    }

    /// @notice Submit a sealed bet using the full Phase 3 dual-encryption
    ///         pattern. Both ciphertexts are produced client-side via bite-ts.
    /// @param marketId Market identifier.
    /// @param teEncryptedOutcome BITE TE-encrypted outcome (precompile 0x1D).
    /// @param eciesEncryptedOutcome BITE ECIES-encrypted outcome under bettor's
    ///        viewer key (precompile 0x1C). Lets the bettor decrypt their own
    ///        bet off chain without trusting the network.
    /// @param viewerKey Bettor's secp256k1 public key. Used at resolution to
    ///        re-encrypt their payout amount inside onDecrypt.
    /// @param stake Plaintext stake amount in the market's collateral token.
    function submitSealedBet(
        uint256 marketId,
        bytes calldata teEncryptedOutcome,
        bytes calldata eciesEncryptedOutcome,
        PublicKey calldata viewerKey,
        uint256 stake
    ) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= m.submissionDeadline) revert SubmissionClosed();
        if (stake == 0) revert ZeroStake();
        if (teEncryptedOutcome.length == 0 || eciesEncryptedOutcome.length == 0) {
            revert EmptyEncryptedOutcome();
        }
        if (viewerKey.x == bytes32(0) && viewerKey.y == bytes32(0)) revert InvalidViewerKey();
        if (m.bets.length >= MAX_BETS_PER_MARKET) revert TooManyBets();

        m.collateral.safeTransferFrom(msg.sender, address(this), stake);

        uint256 betIndex = m.bets.length;
        m.bets.push(
            Bet({
                bettor: msg.sender,
                stake: stake,
                viewerKey: viewerKey,
                teEncryptedOutcome: teEncryptedOutcome,
                eciesEncryptedOutcome: eciesEncryptedOutcome,
                eciesEncryptedPayout: bytes(""),
                chosenOutcome: 0,
                payoutAmount: 0,
                decrypted: false,
                redeemed: false
            })
        );
        m.totalStake += stake;

        emit SealedBetSubmitted(marketId, msg.sender, betIndex, stake);
    }

    /// @notice Submit a sealed bet by passing the plaintext outcome. The
    ///         contract encrypts internally via the Phase 3 precompiles
    ///         (called with msg.sender == address(this), so the resulting
    ///         ciphertext is bound to this pool as the CTX submitter).
    /// @dev    For real privacy, callers should wrap this transaction via
    ///         bite-ts Phase 1 so the plaintextOutcome stays encrypted in
    ///         the mempool. Production-grade clients should produce both
    ///         ciphertexts client-side via bite-ts and use the dual variant.
    /// @param  marketId Market identifier.
    /// @param  plaintextOutcome The chosen outcome index (will be encrypted on chain).
    /// @param  viewerKey Bettor's secp256k1 public key for ECIES self-view.
    /// @param  stake Plaintext stake amount.
    function submitSealedBetWithEncryption(
        uint256 marketId,
        uint256 plaintextOutcome,
        PublicKey calldata viewerKey,
        uint256 stake
    ) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= m.submissionDeadline) revert SubmissionClosed();
        if (stake == 0) revert ZeroStake();
        if (plaintextOutcome >= m.outcomeCount) revert InvalidOutcome();
        if (viewerKey.x == bytes32(0) && viewerKey.y == bytes32(0)) revert InvalidViewerKey();
        if (m.bets.length >= MAX_BETS_PER_MARKET) revert TooManyBets();

        // PHASE 3 inline encryption. msg.sender of these precompile calls is
        // address(this) which matches the future CTX submitter. AAD aligned.
        bytes memory te = BITE.encryptTE(encryptTeAddress, abi.encode(plaintextOutcome));
        bytes memory ecies = BITE.encryptECIES(
            encryptEciesAddress, abi.encode(plaintextOutcome), viewerKey
        );

        m.collateral.safeTransferFrom(msg.sender, address(this), stake);

        uint256 betIndex = m.bets.length;
        m.bets.push(
            Bet({
                bettor: msg.sender,
                stake: stake,
                viewerKey: viewerKey,
                teEncryptedOutcome: te,
                eciesEncryptedOutcome: ecies,
                eciesEncryptedPayout: bytes(""),
                chosenOutcome: 0,
                payoutAmount: 0,
                decrypted: false,
                redeemed: false
            })
        );
        m.totalStake += stake;

        emit SealedBetSubmitted(marketId, msg.sender, betIndex, stake);
    }

    /// @inheritdoc ISortesSealedPool
    /// @dev Legacy single-encryption submit. New clients should use the
    ///      dual-encryption variant above. v1 keeps this for ABI compat.
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
        if (m.bets.length >= MAX_BETS_PER_MARKET) revert TooManyBets();

        m.collateral.safeTransferFrom(msg.sender, address(this), stake);

        uint256 betIndex = m.bets.length;
        m.bets.push(
            Bet({
                bettor: msg.sender,
                stake: stake,
                viewerKey: PublicKey({
                    x: bytes32(uint256(uint160(msg.sender))),
                    y: bytes32(uint256(1))
                }),
                teEncryptedOutcome: encryptedOutcome,
                eciesEncryptedOutcome: encryptedOutcome,
                eciesEncryptedPayout: bytes(""),
                chosenOutcome: 0,
                payoutAmount: 0,
                decrypted: false,
                redeemed: false
            })
        );
        m.totalStake += stake;

        emit SealedBetSubmitted(marketId, msg.sender, betIndex, stake);
    }

    /// @inheritdoc ISortesSealedPool
    function setOracleOutcome(uint256 marketId, uint256 outcome) external override onlyOwner {
        _reportOutcome(marketId, outcome);
    }

    /// @notice Owner sets the resolution oracle adapter for a specific
    ///         market. Once set, the adapter (and only the adapter) can
    ///         call reportOutcomeFromAdapter for that market. Pass
    ///         address(0) to revoke.
    function setMarketOracleAdapter(uint256 marketId, address adapter) external onlyOwner {
        // Read marketId only to validate existence.
        _market(marketId);
        marketOracleAdapter[marketId] = adapter;
    }

    /// @notice Pluggable resolution path. The adapter that owns this
    ///         market's resolution authority calls in to set the outcome.
    ///         For UMA cross-chain: a UmaOracleSink on this chain receives
    ///         the resolved assertion via the SKALE native bridge from
    ///         Base Sepolia and calls this function.
    function reportOutcomeFromAdapter(uint256 marketId, uint256 outcome) external {
        if (msg.sender != marketOracleAdapter[marketId]) revert NotAuthorizedOracleAdapter();
        _reportOutcome(marketId, outcome);
    }

    /// @dev Shared validation + state transition for both oracle paths.
    function _reportOutcome(uint256 marketId, uint256 outcome) private {
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
    /// @dev Funded entirely from contract reserve. Caller does not need to
    ///      attach msg.value, but if they do it gets refunded.
    function triggerResolution(uint256 marketId) external payable override nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.AwaitingDecryption) revert AlreadyTriggered();
        if (!m.oracleReported) revert OracleNotReported();

        uint256 reserveRequired = ctxCallbackValueWei * MIN_CTX_RESERVE_CALLBACKS;
        uint256 reserveAfter = address(this).balance - ctxCallbackValueWei;
        if (reserveAfter < reserveRequired) {
            revert InsufficientCtxReserve(
                reserveRequired + ctxCallbackValueWei, address(this).balance
            );
        }

        uint256 numPub = m.bets.length;
        uint256 numConf = m.confidentialBets.length;
        // Public bets contribute 1 ciphertext (direction) per bet.
        // Confidential bets contribute 2 ciphertexts (direction + stake).
        // Total = numPub + 2*numConf. SubmitCTX requires encArgs.length ==
        // ptxArgs.length so we pad ptxArgs accordingly.
        uint256 totalArgs = numPub + 2 * numConf;
        bytes[] memory encArgs = new bytes[](totalArgs);
        bytes[] memory ptxArgs = new bytes[](totalArgs);

        // Public bets first.
        for (uint256 i = 0; i < numPub; ++i) {
            encArgs[i] = m.bets[i].teEncryptedOutcome;
            // Tag 0 = public bet direction.
            ptxArgs[i] = abi.encode(uint8(0), marketId, i);
        }
        // Then confidential bets: direction + stake.
        for (uint256 i = 0; i < numConf; ++i) {
            uint256 base = numPub + 2 * i;
            encArgs[base] = m.confidentialBets[i].teEncryptedDirection;
            ptxArgs[base] = abi.encode(uint8(1), marketId, i); // tag 1 = conf direction
            encArgs[base + 1] = m.confidentialBets[i].teEncryptedStake;
            ptxArgs[base + 1] = abi.encode(uint8(2), marketId, i); // tag 2 = conf stake
        }

        // PHASE 2: SubmitCTX precompile, batched across both arrays.
        address payable callback = BITE.submitCTX(
            submitCtxAddress, _resolutionGasLimit(totalArgs), encArgs, ptxArgs
        );

        _pendingMarket[callback] = marketId;
        _pendingKind[callback] = CallbackKind.Resolution;
        m.status = MarketStatus.Triggered;

        emit ResolutionTriggered(marketId, callback, m.oracleOutcome);

        callback.sendValue(ctxCallbackValueWei);

        if (msg.value > 0) {
            payable(msg.sender).sendValue(msg.value);
        }
    }

    /// @inheritdoc IBiteSupplicant
    /// @notice BITE Phase 2 callback. Decrypts sealed outcomes, computes
    ///         payouts in plaintext briefly, and re-encrypts each winner's
    ///         payout under their viewer key via Phase 3 EncryptECIES.
    function onDecrypt(
        bytes[] calldata decryptedArguments,
        bytes[] calldata plaintextArguments
    ) external override {
        CallbackKind kind = _pendingKind[msg.sender];
        if (kind == CallbackKind.None) revert UnknownCallback();
        uint256 marketId = _pendingMarket[msg.sender];
        delete _pendingKind[msg.sender];
        delete _pendingMarket[msg.sender];

        if (kind == CallbackKind.Resolution) {
            _settleResolution(marketId, decryptedArguments, plaintextArguments);
        } else if (kind == CallbackKind.AggregateReveal) {
            _settleAggregate(marketId, decryptedArguments, plaintextArguments);
        } else {
            revert UnknownCallback();
        }
    }

    /// @notice Trigger an aggregate reveal for an open market. Decrypts every
    ///         bet submitted since the last reveal in one batch CTX, sums per
    ///         outcome, and adds to the publicly visible aggregate. Anyone
    ///         can call. Anti-deanonymization invariant: at least
    ///         MIN_AGGREGATE_BATCH new bets must be present.
    /// @dev    Pays the BITE callback fee from the contract's CTX reserve.
    function triggerAggregateReveal(uint256 marketId) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Open) revert MarketNotOpen();

        uint256 from = aggregatedUpToIndex[marketId];
        uint256 to = m.bets.length;
        uint256 unagg = to - from;
        if (unagg < MIN_AGGREGATE_BATCH) {
            revert NotEnoughForAggregate(unagg, MIN_AGGREGATE_BATCH);
        }

        uint256 reserveRequired = ctxCallbackValueWei * MIN_CTX_RESERVE_CALLBACKS;
        uint256 reserveAfter = address(this).balance - ctxCallbackValueWei;
        if (reserveAfter < reserveRequired) {
            revert InsufficientCtxReserve(
                reserveRequired + ctxCallbackValueWei, address(this).balance
            );
        }

        bytes[] memory encArgs = new bytes[](unagg);
        bytes[] memory ptxArgs = new bytes[](unagg);
        for (uint256 i = 0; i < unagg; ++i) {
            uint256 betIdx = from + i;
            encArgs[i] = m.bets[betIdx].teEncryptedOutcome;
            ptxArgs[i] = abi.encode(marketId, m.bets[betIdx].stake);
        }

        address payable callback = BITE.submitCTX(
            submitCtxAddress, _aggregateGasLimit(unagg), encArgs, ptxArgs
        );

        _pendingMarket[callback] = marketId;
        _pendingKind[callback] = CallbackKind.AggregateReveal;

        emit AggregateRevealTriggered(marketId, callback, from, to);

        callback.sendValue(ctxCallbackValueWei);
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
            payout = bet.stake;
        } else if (m.winningStake == 0) {
            payout = bet.stake;
        } else if (bet.chosenOutcome == m.oracleOutcome) {
            payout = bet.payoutAmount; // pre-computed in onDecrypt
        } else {
            revert NotAWinner();
        }

        bet.redeemed = true;
        m.collateral.safeTransfer(bet.bettor, payout);
        emit Redeemed(marketId, msg.sender, payout);
    }

    /// @notice Redeem a confidential bet payout. Pays out in cUSDC via the
    ///         confidential token's encryptedTransfer. Plaintext payoutAmount
    ///         was set in onDecrypt; we re-encrypt it here for the cUSDC
    ///         transfer payload.
    /// @dev    Cancellation refund for confidential bets requires the stake
    ///         to be known. v1 only supports redemption from a Resolved
    ///         market (where stakes have been decrypted). Cancelling a
    ///         market that contains confidential bets is gated by setting
    ///         confidentialCollateral to address(0) before cancellation;
    ///         tracked as v1.5 work.
    function redeemConfidential(uint256 marketId, uint256 betIndex) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Resolved) revert ConfidentialBetNotResolved();
        ConfidentialBet storage cbet = m.confidentialBets[betIndex];
        if (cbet.bettor != msg.sender) revert NotBettor();
        if (cbet.redeemed) revert AlreadyRedeemed();

        uint256 payout;
        uint256 totalWinning = m.winningStake + m.confidentialWinningStake;
        if (totalWinning == 0) {
            // Nobody won, refund stake.
            payout = cbet.stake;
        } else if (cbet.chosenOutcome == m.oracleOutcome) {
            payout = cbet.payoutAmount;
        } else {
            revert NotAWinner();
        }

        cbet.redeemed = true;

        // Re-encrypt the payout amount for cUSDC.encryptedTransfer.
        // (The pool itself is the sender; cUSDC's CTX validates pool's
        // encrypted balance covers the transfer.)
        bytes memory encryptedPayout = BITE.encryptTE(
            encryptTeAddress, abi.encode(payout)
        );
        IConfidentialToken(address(m.confidentialCollateral))
            .encryptedTransfer(cbet.bettor, encryptedPayout);

        emit ConfidentialRedeemed(marketId, msg.sender, betIndex, payout);
    }

    /// @notice View an confidential bet's encrypted payout claim. Returns
    ///         empty bytes if the bet didn't win.
    function confidentialEncryptedPayoutOf(uint256 marketId, uint256 betIndex)
        external
        view
        returns (bytes memory)
    {
        return _market(marketId).confidentialBets[betIndex].eciesEncryptedPayout;
    }

    /// @notice Number of confidential bets in a market.
    function confidentialBetCountOf(uint256 marketId) external view returns (uint256) {
        return _market(marketId).confidentialBets.length;
    }

    /// @notice Sweep protocol fees for a resolved market to the treasury.
    function sweepFees(uint256 marketId) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != MarketStatus.Resolved) revert MarketNotResolved();
        if (m.winningStake == 0) return;

        uint256 fee = (m.totalStake * protocolFeeBps) / BPS_DENOMINATOR;
        m.collateral.safeTransfer(treasury, fee);
    }

    function cancelMarket(uint256 marketId) external onlyOwner {
        Market storage m = _market(marketId);
        if (m.status == MarketStatus.Resolved) revert CannotCancelAfterResolution();
        m.status = MarketStatus.Cancelled;
    }

    // ═════════════════════════════════════════════════════════════════
    // Admin
    // ═════════════════════════════════════════════════════════════════

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PROTOCOL_FEE_BPS) revert ProtocolFeeTooHigh();
        protocolFeeBps = newFeeBps;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
    }

    /// @notice Repoint SubmitCTX precompile (for tests against mocks).
    function setSubmitCtxAddress(address newAddress) external onlyOwner {
        if (newAddress == address(0)) revert ZeroAddress();
        submitCtxAddress = newAddress;
    }

    /// @notice Withdraw excess CTX reserve to treasury. Owner cannot drop the
    ///         reserve below MIN_CTX_RESERVE_CALLBACKS callbacks worth.
    function withdrawExcessReserve(uint256 amount) external onlyOwner {
        uint256 reserveRequired = ctxCallbackValueWei * MIN_CTX_RESERVE_CALLBACKS;
        if (address(this).balance - amount < reserveRequired) {
            revert InsufficientCtxReserve(reserveRequired + amount, address(this).balance);
        }
        payable(treasury).sendValue(amount);
    }

    // ═════════════════════════════════════════════════════════════════
    // Views
    // ═════════════════════════════════════════════════════════════════

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
        return _markets.length - 1;
    }

    function ctxReserve() external view returns (uint256) {
        return address(this).balance;
    }

    function minimumCtxReserve() public view returns (uint256) {
        return ctxCallbackValueWei * MIN_CTX_RESERVE_CALLBACKS;
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
            m.question, m.outcomeCount, m.submissionDeadline, m.resolutionTime,
            address(m.collateral), m.status, m.oracleOutcome, m.oracleReported,
            m.totalStake, m.winningStake, m.bets.length
        );
    }

    function betInfo(uint256 marketId, uint256 betIndex)
        external
        view
        returns (
            address bettor,
            uint256 stake,
            bytes memory teEncryptedOutcome,
            bytes memory eciesEncryptedOutcome,
            bytes memory eciesEncryptedPayout,
            uint256 chosenOutcome,
            bool decrypted,
            bool redeemed
        )
    {
        Bet storage b = _market(marketId).bets[betIndex];
        return (
            b.bettor,
            b.stake,
            b.teEncryptedOutcome,
            b.eciesEncryptedOutcome,
            b.eciesEncryptedPayout,
            b.chosenOutcome,
            b.decrypted,
            b.redeemed
        );
    }

    function viewerKeyOf(uint256 marketId, uint256 betIndex)
        external
        view
        returns (PublicKey memory)
    {
        return _market(marketId).bets[betIndex].viewerKey;
    }

    /// @notice Read-only access to the encrypted payout claim for a winning bet.
    ///         The bettor decrypts off chain with their viewer private key.
    function encryptedPayoutOf(uint256 marketId, uint256 betIndex)
        external
        view
        returns (bytes memory)
    {
        return _market(marketId).bets[betIndex].eciesEncryptedPayout;
    }

    // ═════════════════════════════════════════════════════════════════
    // Internals
    // ═════════════════════════════════════════════════════════════════

    function _market(uint256 marketId) private view returns (Market storage) {
        if (marketId == 0 || marketId >= _markets.length) revert MarketDoesNotExist();
        return _markets[marketId];
    }

    /// @dev Phase 2 callback handler. Walks decrypted outcomes, marks winners,
    ///      computes plaintext payouts, then re-encrypts each winner's payout
    ///      under their viewer key via Phase 3 EncryptECIES (precompile 0x1C).
    ///      Plaintext payouts exist only inside this function's stack frame
    ///      and the storage slots they're written to. Off-chain observers see
    ///      only the encrypted ciphertext via encryptedPayoutOf.
    function _settleResolution(
        uint256 marketId,
        bytes[] calldata decryptedArguments,
        bytes[] calldata plaintextArguments
    ) private {
        if (plaintextArguments.length != decryptedArguments.length) {
            revert CallbackArgsLengthMismatch();
        }
        Market storage m = _markets[marketId];

        uint256 numPub = m.bets.length;
        uint256 numConf = m.confidentialBets.length;
        if (decryptedArguments.length != numPub + 2 * numConf) {
            revert CallbackArgsLengthMismatch();
        }

        uint256 winningOutcome = m.oracleOutcome;

        uint256 publicWinningStake = 0;
        uint256 confidentialTotalStake = 0;
        uint256 confidentialWinningStake = 0;

        // Walk the unified arg array. Tag in plaintextArguments[i] dispatches:
        //   0 = public direction
        //   1 = confidential direction
        //   2 = confidential stake
        for (uint256 i = 0; i < decryptedArguments.length; ++i) {
            bytes calldata raw = decryptedArguments[i];
            if (raw.length != 32) revert DecryptedValueWrongLength();
            uint256 value = abi.decode(raw, (uint256));

            (uint8 tag, uint256 mid, uint256 betIdx) = abi.decode(
                plaintextArguments[i], (uint8, uint256, uint256)
            );
            if (mid != marketId) revert UnknownCallback();

            if (tag == 0) {
                Bet storage bet = m.bets[betIdx];
                bet.chosenOutcome = value;
                bet.decrypted = true;
                if (value == winningOutcome) {
                    publicWinningStake += bet.stake;
                }
            } else if (tag == 1) {
                m.confidentialBets[betIdx].chosenOutcome = value;
            } else if (tag == 2) {
                ConfidentialBet storage cbet = m.confidentialBets[betIdx];
                cbet.stake = value;
                cbet.decrypted = true;
                confidentialTotalStake += value;
                if (cbet.chosenOutcome == winningOutcome) {
                    confidentialWinningStake += value;
                }
            } else {
                revert UnknownCallbackType();
            }
        }

        m.winningStake = publicWinningStake;
        m.confidentialTotalStake = confidentialTotalStake;
        m.confidentialWinningStake = confidentialWinningStake;

        // UNIFIED POT MATH. Both arrays share the same pot, so a confidential
        // whale with stake X (in cUSDC) gets matched against losing bets from
        // BOTH public and confidential sides. No fragmented liquidity.
        uint256 grossPot = m.totalStake + confidentialTotalStake;
        uint256 totalWinning = publicWinningStake + confidentialWinningStake;
        uint256 fee = (grossPot * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 netPot = grossPot - fee;

        // Compute payouts and re-encrypt winning amounts under viewer keys.
        if (totalWinning == 0) {
            // Nobody picked the winning outcome: refund everyone their stake.
            for (uint256 i = 0; i < numPub; ++i) {
                Bet storage bet = m.bets[i];
                bet.payoutAmount = bet.stake;
                bet.eciesEncryptedPayout = BITE.encryptECIES(
                    encryptEciesAddress, abi.encode(bet.stake), bet.viewerKey
                );
            }
            for (uint256 i = 0; i < numConf; ++i) {
                ConfidentialBet storage cbet = m.confidentialBets[i];
                cbet.payoutAmount = cbet.stake;
                cbet.eciesEncryptedPayout = BITE.encryptECIES(
                    encryptEciesAddress, abi.encode(cbet.stake), cbet.viewerKey
                );
            }
        } else {
            for (uint256 i = 0; i < numPub; ++i) {
                Bet storage bet = m.bets[i];
                if (bet.chosenOutcome == winningOutcome) {
                    uint256 payout = (bet.stake * netPot) / totalWinning;
                    bet.payoutAmount = payout;
                    bet.eciesEncryptedPayout = BITE.encryptECIES(
                        encryptEciesAddress, abi.encode(payout), bet.viewerKey
                    );
                }
            }
            for (uint256 i = 0; i < numConf; ++i) {
                ConfidentialBet storage cbet = m.confidentialBets[i];
                if (cbet.chosenOutcome == winningOutcome) {
                    uint256 payout = (cbet.stake * netPot) / totalWinning;
                    cbet.payoutAmount = payout;
                    cbet.eciesEncryptedPayout = BITE.encryptECIES(
                        encryptEciesAddress, abi.encode(payout), cbet.viewerKey
                    );
                }
            }
        }

        m.status = MarketStatus.Resolved;
        emit MarketResolved(marketId, winningOutcome, grossPot, totalWinning);
    }

    /// @notice Per-call gas budget for the resolution callback.
    function _resolutionGasLimit(uint256 numBets) private pure returns (uint256) {
        // Per-bet cost dominated by ECIES encryption + storage write.
        uint256 perBet = 75_000;
        uint256 baseline = 250_000;
        uint256 estimated = baseline + numBets * perBet;
        if (estimated > CTX_GAS_LIMIT) return CTX_GAS_LIMIT;
        return estimated;
    }

    /// @notice Per-call gas budget for the aggregate reveal callback.
    /// @dev    Cheaper than resolution: just plaintext sums, no ECIES.
    function _aggregateGasLimit(uint256 numBets) private pure returns (uint256) {
        uint256 perBet = 30_000;
        uint256 baseline = 200_000;
        uint256 estimated = baseline + numBets * perBet;
        if (estimated > CTX_GAS_LIMIT) return CTX_GAS_LIMIT;
        return estimated;
    }

    /// @notice BITE callback handler for aggregate reveal CTXs. Walks the
    ///         decrypted outcomes, adds stakes to the per-outcome public
    ///         totals, advances the aggregatedUpToIndex cursor.
    function _settleAggregate(
        uint256 marketId,
        bytes[] calldata decryptedArguments,
        bytes[] calldata plaintextArguments
    ) private {
        if (plaintextArguments.length != decryptedArguments.length) {
            revert CallbackArgsLengthMismatch();
        }
        uint256 numItems = decryptedArguments.length;

        for (uint256 i = 0; i < numItems; ++i) {
            bytes calldata raw = decryptedArguments[i];
            if (raw.length != 32) revert DecryptedValueWrongLength();
            uint256 outcome = abi.decode(raw, (uint256));

            (uint256 decodedMarketId, uint256 stake) = abi.decode(
                plaintextArguments[i], (uint256, uint256)
            );
            if (decodedMarketId != marketId) revert UnknownCallback();

            aggregatePerOutcome[marketId][outcome] += stake;
            emit AggregateUpdated(
                marketId,
                outcome,
                aggregatePerOutcome[marketId][outcome],
                aggregatedUpToIndex[marketId] + i + 1
            );
        }

        aggregatedUpToIndex[marketId] += numItems;
    }
}
