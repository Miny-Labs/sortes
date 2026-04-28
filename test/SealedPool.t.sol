// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { BiteMock } from "@skalenetwork/bite-solidity/test/BiteMock.sol";
import { SubmitCTXMock } from "@skalenetwork/bite-solidity/test/SubmitCTXMock.sol";
import { EncryptECIESMock } from "@skalenetwork/bite-solidity/test/EncryptECIESMock.sol";

import { SealedPool } from "../src/SealedPool.sol";
import { ISortesSealedPool } from "../src/interfaces/ISortesSealedPool.sol";
import { PublicKey } from "@skalenetwork/bite-solidity/types.sol";

import { MockUSDC } from "./mocks/MockUSDC.sol";

/// @notice Behavioural tests for SealedPool v2 (Phase 2 + Phase 3) against the
///         BITE mock stack. Covers both the dual-encryption submitSealedBet
///         and the legacy single-encryption variant, the CTX reserve invariant,
///         the ECIES payout re-encryption inside onDecrypt, and the full
///         happy/refund/cancel lifecycle.
contract SealedPoolTest is Test {
    SealedPool internal pool;
    MockUSDC internal usdc;
    BiteMock internal bite;
    SubmitCTXMock internal submitCTXMock;
    EncryptECIESMock internal encryptECIESMock;

    address internal owner = address(0xA1);
    address internal treasury = address(0xB1);
    address internal alice = address(0xCAFE);
    address internal bob = address(0xBABE);
    address internal carol = address(0xC0DE);
    address internal dave = address(0xD0DE);

    uint256 internal constant ONE_USDC = 1_000_000;
    uint256 internal constant CTX_CALLBACK_VALUE = 0.01 ether;
    /// @dev Seed enough for the 10-callback minimum reserve plus headroom for
    ///      multiple in-test triggerResolution calls without falling below.
    uint256 internal constant RESERVE_AMOUNT = CTX_CALLBACK_VALUE * 20;

    function setUp() public {
        bite = new BiteMock();
        submitCTXMock = new SubmitCTXMock(bite);
        encryptECIESMock = new EncryptECIESMock(bite);

        // Plant EncryptECIESMock code at the canonical 0x1C address so the
        // SealedPool's onDecrypt path that calls BITE.encryptECIES resolves
        // through the mock during local tests.
        vm.etch(address(uint160(0x1C)), address(encryptECIESMock).code);

        vm.deal(owner, 10 ether);
        vm.prank(owner);
        pool = new SealedPool{ value: RESERVE_AMOUNT }(
            owner, treasury, CTX_CALLBACK_VALUE
        );

        vm.prank(owner);
        pool.setSubmitCtxAddress(address(submitCTXMock));

        usdc = new MockUSDC();

        address[4] memory users = [alice, bob, carol, dave];
        for (uint256 i = 0; i < users.length; ++i) {
            usdc.mint(users[i], 10_000 * ONE_USDC);
            vm.prank(users[i]);
            usdc.approve(address(pool), type(uint256).max);
            vm.deal(users[i], 1 ether);
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    function _enc(uint256 outcome) internal view returns (bytes memory) {
        return bite.encryptTE(abi.encode(outcome));
    }

    function _viewerKey(address who) internal pure returns (PublicKey memory) {
        return PublicKey({
            x: bytes32(uint256(uint160(who))),
            y: bytes32(uint256(0xBEEF))
        });
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

    function _bet(address from, uint256 marketId, uint256 outcome, uint256 stake) internal {
        bytes memory ciphertext = _enc(outcome);
        vm.prank(from);
        pool.submitSealedBet(marketId, ciphertext, stake);
    }

    function _betDual(address from, uint256 marketId, uint256 outcome, uint256 stake) internal {
        bytes memory te = _enc(outcome);
        bytes memory ecies = _enc(outcome);
        PublicKey memory key = _viewerKey(from);
        vm.prank(from);
        pool.submitSealedBet(marketId, te, ecies, key, stake);
    }

    // ─── Constructor / reserve ─────────────────────────────────────────

    function test_ConstructorSeedsReserve() public view {
        assertEq(pool.ctxReserve(), RESERVE_AMOUNT);
        assertEq(pool.minimumCtxReserve(), CTX_CALLBACK_VALUE * 10);
        assertEq(pool.ctxCallbackValueWei(), CTX_CALLBACK_VALUE);
    }

    function test_ConstructorRevertsWithoutReserve() public {
        uint256 minRequired = CTX_CALLBACK_VALUE * 10;
        vm.expectRevert(
            abi.encodeWithSelector(
                SealedPool.InsufficientCtxReserve.selector, minRequired, 0
            )
        );
        new SealedPool(owner, treasury, CTX_CALLBACK_VALUE);
    }

    function test_ConstructorRejectsZeroValues() public {
        vm.expectRevert(SealedPool.ZeroAddress.selector);
        new SealedPool{ value: RESERVE_AMOUNT }(owner, address(0), CTX_CALLBACK_VALUE);

        vm.expectRevert(SealedPool.ZeroValue.selector);
        new SealedPool{ value: 0 }(owner, treasury, 0);
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────

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

    // ─── Legacy single-encryption submission ───────────────────────────

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

    // ─── Phase 3 dual-encryption submission ────────────────────────────

    function test_SubmitDualEncryptedBetStoresViewerKey() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        _betDual(alice, marketId, 1, 100 * ONE_USDC);

        PublicKey memory key = pool.viewerKeyOf(marketId, 0);
        PublicKey memory expected = _viewerKey(alice);
        assertEq(uint256(key.x), uint256(expected.x));
        assertEq(uint256(key.y), uint256(expected.y));
    }

    function test_SubmitDualBetRejectsZeroViewerKey() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        bytes memory te = _enc(0);
        bytes memory ecies = _enc(0);
        PublicKey memory zeroKey = PublicKey({ x: bytes32(0), y: bytes32(0) });
        vm.prank(alice);
        vm.expectRevert(SealedPool.InvalidViewerKey.selector);
        pool.submitSealedBet(marketId, te, ecies, zeroKey, 100 * ONE_USDC);
    }

    // ─── Oracle and resolution ─────────────────────────────────────────

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
        vm.expectRevert(SealedPool.AlreadyTriggered.selector);
        pool.triggerResolution(marketId);
    }

    // ─── Full happy path with Phase 3 payout re-encryption ─────────────

    function test_DualEncryptedHappyPathWithReEncryptedPayout() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);

        uint256 aliceStake = 200 * ONE_USDC;
        uint256 bobStake = 300 * ONE_USDC;
        uint256 carolStake = 500 * ONE_USDC;

        _betDual(alice, marketId, 1, aliceStake);
        _betDual(bob,   marketId, 1, bobStake);
        _betDual(carol, marketId, 0, carolStake);

        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 1);

        pool.triggerResolution(marketId);
        bite.sendCallback();

        assertEq(
            uint256(pool.statusOf(marketId)),
            uint256(ISortesSealedPool.MarketStatus.Resolved)
        );

        (, , , , bytes memory aliceEnc, , , ) = pool.betInfo(marketId, 0);
        (, , , , bytes memory bobEnc, , , )   = pool.betInfo(marketId, 1);
        (, , , , bytes memory carolEnc, , , ) = pool.betInfo(marketId, 2);

        assertGt(aliceEnc.length, 0, "alice should have encrypted payout");
        assertGt(bobEnc.length, 0, "bob should have encrypted payout");
        assertEq(carolEnc.length, 0, "carol (loser) should have no encrypted payout");

        uint256 totalStake = aliceStake + bobStake + carolStake;
        uint256 winningStake = aliceStake + bobStake;
        uint256 fee = totalStake * 100 / 10_000;
        uint256 netPot = totalStake - fee;
        uint256 expectedAlice = aliceStake * netPot / winningStake;
        uint256 expectedBob = bobStake * netPot / winningStake;

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pool.redeem(marketId, 0);
        assertEq(usdc.balanceOf(alice) - aliceBefore, expectedAlice);

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        pool.redeem(marketId, 1);
        assertEq(usdc.balanceOf(bob) - bobBefore, expectedBob);

        vm.prank(carol);
        vm.expectRevert(SealedPool.NotAWinner.selector);
        pool.redeem(marketId, 2);
    }

    function test_NoWinners_StakesRefunded() public {
        uint256 marketId = _createBinaryMarket(1 days, 2 days);
        uint256 aliceStake = 100 * ONE_USDC;
        uint256 bobStake = 200 * ONE_USDC;

        _betDual(alice, marketId, 0, aliceStake);
        _betDual(bob,   marketId, 0, bobStake);

        skip(2 days);
        vm.prank(owner);
        pool.setOracleOutcome(marketId, 1);

        pool.triggerResolution(marketId);
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

        _betDual(alice, marketId, 0, 100 * ONE_USDC);
        _betDual(bob,   marketId, 1, 200 * ONE_USDC);

        vm.prank(owner);
        pool.cancelMarket(marketId);

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

        pool.triggerResolution(marketId);
        vm.expectRevert(SealedPool.AlreadyTriggered.selector);
        pool.triggerResolution(marketId);
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

    function test_MaxBetsPerMarketIsHardcoded() public view {
        assertEq(pool.MAX_BETS_PER_MARKET(), 200);
    }

    function test_WithdrawExcessReserveRespectsMinimum() public {
        // Initial reserve is RESERVE_AMOUNT (= 20x). Min is 10x. So 10x is
        // freely withdrawable. Withdraw it, then verify we cannot dip into
        // the protected 10x minimum.
        uint256 minRequired = CTX_CALLBACK_VALUE * 10;
        uint256 excess = RESERVE_AMOUNT - minRequired;

        vm.prank(owner);
        pool.withdrawExcessReserve(excess);
        assertEq(pool.ctxReserve(), minRequired);

        vm.prank(owner);
        vm.expectRevert();
        pool.withdrawExcessReserve(1);
    }

    receive() external payable {}
}
