// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { BiteMock } from "@skalenetwork/bite-solidity/test/BiteMock.sol";
import { SubmitCTXMock } from "@skalenetwork/bite-solidity/test/SubmitCTXMock.sol";

import { SealedPool } from "../src/SealedPool.sol";
import { ISortesSealedPool } from "../src/interfaces/ISortesSealedPool.sol";

import { MockUSDC } from "./mocks/MockUSDC.sol";

/// @notice Behavioural tests for SealedPool against the BITE mock stack.
/// @dev    The flow under test:
///         setUp deploys BiteMock + SubmitCTXMock and points SealedPool at
///         SubmitCTXMock as its precompile. Encrypted outcomes are produced by
///         calling bite.encryptTE() on abi-encoded uint256 values; BiteMock
///         decrypts them symmetrically inside submitCTX. After triggerResolution
///         the test calls bite.sendCallback() to fire the onDecrypt callback.
///
///         Important Foundry detail: vm.prank is consumed by the very next call.
///         Because Solidity evaluates function call arguments before the function
///         itself, `pool.submitSealedBet(id, _enc(x), stake)` would burn the prank
///         on the _enc() external call. We therefore pre-compute ciphertexts into
///         locals, then prank, then call the pool.
contract SealedPoolTest is Test {
    SealedPool internal pool;
    MockUSDC internal usdc;
    BiteMock internal bite;
    SubmitCTXMock internal submitCTXMock;

    address internal owner = address(0xA1);
    address internal treasury = address(0xB1);
    address internal alice = address(0xCAFE);
    address internal bob = address(0xBABE);
    address internal carol = address(0xC0DE);
    address internal dave = address(0xD0DE);

    uint256 internal constant ONE_USDC = 1_000_000; // 6 decimals
    uint256 internal constant CALLBACK_FEE = 1_000 gwei;

    function setUp() public {
        bite = new BiteMock();
        submitCTXMock = new SubmitCTXMock(bite);

        vm.prank(owner);
        pool = new SealedPool(owner, treasury);

        vm.prank(owner);
        pool.setSubmitCTXAddress(address(submitCTXMock));

        usdc = new MockUSDC();

        address[4] memory users = [alice, bob, carol, dave];
        for (uint256 i = 0; i < users.length; ++i) {
            usdc.mint(users[i], 10_000 * ONE_USDC);
            vm.prank(users[i]);
            usdc.approve(address(pool), type(uint256).max);
            vm.deal(users[i], 1 ether);
        }
        vm.deal(owner, 1 ether);
    }

    // ----------------- Helpers -----------------

    /// @dev Returns BITE-mock TE-encrypted bytes for an outcome.
    function _enc(uint256 outcome) internal view returns (bytes memory) {
        return bite.encryptTE(abi.encode(outcome));
    }

    function _createBinaryMarket(uint256 deadlineOffset, uint256 resolutionOffset)
        internal
        returns (uint256)
    {
        vm.prank(owner);
        return pool.createMarket(
            "Will ETH close above $5000 on July 1?",
            2,
            block.timestamp + deadlineOffset,
            block.timestamp + resolutionOffset,
            address(usdc)
        );
    }

    /// @dev Place a sealed bet. Pre-encodes the outcome to avoid burning a prank.
    function _bet(address from, uint256 marketId, uint256 outcome, uint256 stake) internal {
        bytes memory ciphertext = _enc(outcome);
        vm.prank(from);
        pool.submitSealedBet(marketId, ciphertext, stake);
    }

    // ----------------- Lifecycle -----------------

    function test_CreateMarketEmitsAndStoresMetadata() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit ISortesSealedPool.MarketCreated(
            1,
            "Will ETH close above $5000 on July 1?",
            2,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            address(usdc)
        );
        uint256 marketId = pool.createMarket(
            "Will ETH close above $5000 on July 1?",
            2,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            address(usdc)
        );
        assertEq(marketId, 1);
        assertEq(uint256(pool.statusOf(marketId)), uint256(ISortesSealedPool.MarketStatus.Open));
        assertEq(pool.betCountOf(marketId), 0);
        assertEq(pool.totalStakeOf(marketId), 0);
    }

    function test_CreateMarketRejectsBadInput() public {
        vm.startPrank(owner);

        vm.expectRevert(SealedPool.EmptyQuestion.selector);
        pool.createMarket("", 2, block.timestamp + 1 days, block.timestamp + 2 days, address(usdc));

        vm.expectRevert(SealedPool.InvalidOutcomeCount.selector);
        pool.createMarket("q", 1, block.timestamp + 1 days, block.timestamp + 2 days, address(usdc));

        vm.expectRevert(SealedPool.InvalidDeadlineOrder.selector);
        pool.createMarket("q", 2, block.timestamp - 1, block.timestamp + 2 days, address(usdc));

        vm.expectRevert(SealedPool.InvalidDeadlineOrder.selector);
        pool.createMarket("q", 2, block.timestamp + 2 days, block.timestamp + 1 days, address(usdc));

        vm.expectRevert(SealedPool.ZeroAddress.selector);
        pool.createMarket("q", 2, block.timestamp + 1 days, block.timestamp + 2 days, address(0));

        vm.stopPrank();
    }

    function test_OnlyOwnerCanCreateMarket() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.createMarket("q", 2, block.timestamp + 1 days, block.timestamp + 2 days, address(usdc));
    }

    // ----------------- Bet submission -----------------

    function test_SubmitBetEscrowsCollateral() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        uint256 stake = 100 * ONE_USDC;
        uint256 aliceBefore = usdc.balanceOf(alice);

        _bet(alice, marketId, 0, stake);

        assertEq(usdc.balanceOf(alice), aliceBefore - stake);
        assertEq(usdc.balanceOf(address(pool)), stake);
        assertEq(pool.betCountOf(marketId), 1);
        assertEq(pool.totalStakeOf(marketId), stake);
    }

    function test_SubmitBetRevertsAfterDeadline() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        skip(1 days + 1);

        bytes memory ciphertext = _enc(0);
        vm.prank(alice);
        vm.expectRevert(SealedPool.SubmissionClosed.selector);
        pool.submitSealedBet(marketId, ciphertext, 100 * ONE_USDC);
    }

    function test_SubmitBetRejectsZeroStake() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        bytes memory ciphertext = _enc(0);
        vm.prank(alice);
        vm.expectRevert(SealedPool.ZeroStake.selector);
        pool.submitSealedBet(marketId, ciphertext, 0);
    }

    function test_SubmitBetRejectsEmptyCiphertext() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        vm.prank(alice);
        vm.expectRevert(SealedPool.EmptyEncryptedOutcome.selector);
        pool.submitSealedBet(marketId, "", 100 * ONE_USDC);
    }

    function test_SubmitBetRejectsBadMarketId() public {
        bytes memory ciphertext = _enc(0);
        vm.prank(alice);
        vm.expectRevert(SealedPool.MarketDoesNotExist.selector);
        pool.submitSealedBet(999, ciphertext, 100 * ONE_USDC);
    }

    // ----------------- Oracle and resolution -----------------

    function test_SetOracleOutcomeAfterResolutionTime() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _bet(alice, marketId, 0, 100 * ONE_USDC);
        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 1);
        assertEq(
            uint256(pool.statusOf(marketId)),
            uint256(ISortesSealedPool.MarketStatus.AwaitingDecryption)
        );
    }

    function test_SetOracleRevertsBeforeResolutionTime() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        vm.prank(owner);
        vm.expectRevert(SealedPool.NotResolutionTimeYet.selector);
        pool.setOracleOutcome(marketId, 0);
    }

    function test_SetOracleRevertsOnInvalidOutcomeIndex() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        skip(2 days);
        vm.prank(owner);
        vm.expectRevert(SealedPool.InvalidOutcome.selector);
        pool.setOracleOutcome(marketId, 5);
    }

    function test_TriggerWithoutOracleReverts() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _bet(alice, marketId, 0, 100 * ONE_USDC);
        skip(2 days);
        vm.expectRevert(SealedPool.AlreadyTriggered.selector); // status still Open
        pool.triggerResolution{ value: CALLBACK_FEE }(marketId);
    }

    function test_TriggerWithInsufficientFeeReverts() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _bet(alice, marketId, 0, 100 * ONE_USDC);
        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 0);

        vm.expectRevert(
            abi.encodeWithSelector(SealedPool.InsufficientCallbackFee.selector, CALLBACK_FEE, 0)
        );
        pool.triggerResolution{ value: 0 }(marketId);
    }

    // ----------------- Full happy path -----------------

    function test_SubmitResolveAndRedeem_HappyPath() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);

        uint256 aliceStake = 200 * ONE_USDC;
        uint256 bobStake = 300 * ONE_USDC;
        uint256 carolStake = 500 * ONE_USDC;

        _bet(alice, marketId, 1, aliceStake);
        _bet(bob,   marketId, 1, bobStake);
        _bet(carol, marketId, 0, carolStake);

        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 1);

        pool.triggerResolution{ value: CALLBACK_FEE }(marketId);
        bite.sendCallback();

        assertEq(
            uint256(pool.statusOf(marketId)),
            uint256(ISortesSealedPool.MarketStatus.Resolved)
        );

        // Total = 1000 USDC. Winning stake = 500 USDC. Fee 1% of 1000 = 10. Net = 990.
        // Alice 200/500 * 990 = 396; Bob 300/500 * 990 = 594.
        uint256 totalStake = aliceStake + bobStake + carolStake;
        uint256 winningStake = aliceStake + bobStake;
        uint256 fee = totalStake * 100 / 10_000;
        uint256 netPot = totalStake - fee;
        uint256 expectedAlice = aliceStake * netPot / winningStake;
        uint256 expectedBob = bobStake * netPot / winningStake;

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(alice);
        pool.redeem(marketId, 0);
        assertEq(usdc.balanceOf(alice) - aliceBefore, expectedAlice);

        vm.prank(bob);
        pool.redeem(marketId, 1);
        assertEq(usdc.balanceOf(bob) - bobBefore, expectedBob);

        vm.prank(carol);
        vm.expectRevert(SealedPool.NotAWinner.selector);
        pool.redeem(marketId, 2);

        vm.prank(alice);
        vm.expectRevert(SealedPool.AlreadyRedeemed.selector);
        pool.redeem(marketId, 0);
    }

    function test_NoWinners_StakesRefunded() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        uint256 aliceStake = 100 * ONE_USDC;
        uint256 bobStake = 200 * ONE_USDC;

        _bet(alice, marketId, 0, aliceStake);
        _bet(bob,   marketId, 0, bobStake);

        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 1);

        pool.triggerResolution{ value: CALLBACK_FEE }(marketId);
        bite.sendCallback();

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(alice);
        pool.redeem(marketId, 0);
        vm.prank(bob);
        pool.redeem(marketId, 1);

        assertEq(usdc.balanceOf(alice) - aliceBefore, aliceStake);
        assertEq(usdc.balanceOf(bob) - bobBefore, bobStake);
    }

    function test_Cancellation_RefundsStakes() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);

        _bet(alice, marketId, 0, 100 * ONE_USDC);
        _bet(bob,   marketId, 1, 200 * ONE_USDC);

        vm.prank(owner);
        pool.cancelMarket(marketId);

        assertEq(
            uint256(pool.statusOf(marketId)),
            uint256(ISortesSealedPool.MarketStatus.Cancelled)
        );

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(alice);
        pool.redeem(marketId, 0);
        vm.prank(bob);
        pool.redeem(marketId, 1);

        assertEq(usdc.balanceOf(alice) - aliceBefore, 100 * ONE_USDC);
        assertEq(usdc.balanceOf(bob) - bobBefore, 200 * ONE_USDC);
    }

    function test_OnDecryptRejectsUnknownCallback() public {
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(SealedPool.UnknownCallback.selector);
        pool.onDecrypt(empty, empty);
    }

    function test_TriggerCannotBeCalledTwice() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _bet(alice, marketId, 0, 100 * ONE_USDC);
        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 0);

        pool.triggerResolution{ value: CALLBACK_FEE }(marketId);
        vm.expectRevert(SealedPool.AlreadyTriggered.selector);
        pool.triggerResolution{ value: CALLBACK_FEE }(marketId);
    }

    function test_CannotRedeemBeforeResolution() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _bet(alice, marketId, 0, 100 * ONE_USDC);

        vm.prank(alice);
        vm.expectRevert(SealedPool.MarketNotResolved.selector);
        pool.redeem(marketId, 0);
    }

    function test_AdminFeeBumpRespectsCap() public {
        vm.startPrank(owner);
        pool.setProtocolFeeBps(500);
        assertEq(pool.protocolFeeBps(), 500);
        vm.expectRevert(SealedPool.ProtocolFeeTooHigh.selector);
        pool.setProtocolFeeBps(501);
        vm.stopPrank();
    }

    function test_TooManyBetsCap() public {
        vm.prank(owner);
        pool.setMaxBetsPerMarket(2);

        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _bet(alice, marketId, 0, 100 * ONE_USDC);
        _bet(bob,   marketId, 1, 100 * ONE_USDC);

        bytes memory ciphertext = _enc(0);
        vm.prank(carol);
        vm.expectRevert(SealedPool.TooManyBets.selector);
        pool.submitSealedBet(marketId, ciphertext, 100 * ONE_USDC);
    }

    function test_ExcessCallbackFeeIsRefunded() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _bet(alice, marketId, 0, 100 * ONE_USDC);
        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 0);

        uint256 callerBefore = address(this).balance;
        pool.triggerResolution{ value: CALLBACK_FEE * 3 }(marketId);
        assertEq(address(this).balance, callerBefore - CALLBACK_FEE);
    }

    receive() external payable {}
}
