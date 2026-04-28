// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { BiteMock } from "@skalenetwork/bite-solidity/test/BiteMock.sol";

/// @notice Wrapper-shaped stand-in for the SKALE ConfidentialWrapper. Used to
///         exercise SealedPool.submitConfidentialBet and the cross-pot wrap /
///         unwrap fallbacks inside redeem and redeemConfidential.
///
/// @dev    Balances are stored in clear here for test ergonomics. Pretends to
///         be both an IConfidentialToken (encryptedTransfer*) and an
///         IConfidentialWrapper (depositFor / withdrawTo) backed by an
///         underlying ERC20.
contract MockConfidentialToken {
    using SafeERC20 for IERC20;

    BiteMock public immutable bite;
    IERC20 public underlying;

    mapping(address => uint256) public balanceOf;

    event TransferIn(address indexed from, address indexed to, uint256 value);
    event TransferOut(address indexed from, address indexed to, uint256 value);
    event Wrap(address indexed account, uint256 value);
    event Unwrap(address indexed account, uint256 value);

    constructor(BiteMock biteMock_) {
        bite = biteMock_;
    }

    function setUnderlying(IERC20 token) external {
        underlying = token;
    }

    /// @notice Free-mint a balance. Used by tests to simulate a prior wrap.
    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
    }

    function encryptedTransferFrom(address from, address to, bytes calldata value) external {
        uint256 amount = abi.decode(bite.decryptTE(value), (uint256));
        require(balanceOf[from] >= amount, "MockCnf: insufficient");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit TransferIn(from, to, amount);
    }

    function encryptedTransfer(address to, bytes calldata value) external {
        uint256 amount = abi.decode(bite.decryptTE(value), (uint256));
        require(balanceOf[msg.sender] >= amount, "MockCnf: insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit TransferOut(msg.sender, to, amount);
    }

    /// @notice Wrap underlying ERC20 into this confidential token.
    function depositFor(address account, uint256 value) external returns (bool) {
        require(address(underlying) != address(0), "MockCnf: no underlying");
        underlying.safeTransferFrom(msg.sender, address(this), value);
        balanceOf[account] += value;
        emit Wrap(account, value);
        return true;
    }

    /// @notice Unwrap into underlying ERC20. Burns msg.sender's confidential
    ///         balance and releases that much underlying back to msg.sender.
    function withdrawTo(address account, uint256 value) external returns (bool) {
        require(address(underlying) != address(0), "MockCnf: no underlying");
        require(balanceOf[msg.sender] >= value, "MockCnf: insufficient");
        balanceOf[msg.sender] -= value;
        underlying.safeTransfer(account, value);
        emit Unwrap(account, value);
        return true;
    }
}
