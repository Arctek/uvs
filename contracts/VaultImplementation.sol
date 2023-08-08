// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./IVaultsFactory.sol";
import "./IVault.sol";


contract VaultImplementation is IVault, Initializable, ERC20Upgradeable {
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

    IERC20MetadataUpgradeable public underlyingToken;
    IVaultsFactory public factory;

    struct PendingUnwrap {
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => PendingUnwrap) public pendingUnwraps;

    event Wrapped(address indexed user, uint256 amount);
    event Unwrapped(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event UnwrapCancelled(address indexed user, uint256 amount);

    modifier notPaused() {
        require(!factory.isPaused(address(this)), "Operation is paused");
        _;
    }

    function initialize(address underlyingTokenAddress_, IVaultsFactory factory_) public initializer {
        underlyingToken = IERC20MetadataUpgradeable(underlyingTokenAddress_);
        factory = factory_;
        __ERC20_init(
            string(abi.encodePacked("Vaulted ", underlyingToken.name())),
            string(abi.encodePacked("v", underlyingToken.symbol()))
        );
    }

    function decimals() public view virtual override returns (uint8) {
        return underlyingToken.decimals();
    }

    function wrap(uint256 amount_) external notPaused {
        underlyingToken.safeTransferFrom(msg.sender, address(this), amount_);
        _mint(msg.sender, amount_);
        emit Wrapped(msg.sender, amount_);
    }

    function unwrap(uint256 amount_) external notPaused {
        require(amount_ > 0, "Amount should be greater than 0");
        require(balanceOf(msg.sender) >= amount_, "Insufficient balance to unwrap");
        pendingUnwraps[msg.sender] = PendingUnwrap(amount_, block.timestamp);
        emit Unwrapped(msg.sender, amount_);
    }

    function claim() external notPaused {
        require(pendingUnwraps[msg.sender].amount > 0, "No unwrap requested");
        require(block.timestamp >= pendingUnwraps[msg.sender].timestamp + factory.unwrapDelay(), "Delay has not passed yet");

        uint256 amount = pendingUnwraps[msg.sender].amount;
        delete pendingUnwraps[msg.sender];

        _burn(msg.sender, amount);
        underlyingToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function cancelUnwrap() external notPaused {
        require(pendingUnwraps[msg.sender].amount > 0, "No unwrap requested to cancel");
        uint256 amount = pendingUnwraps[msg.sender].amount;
        delete pendingUnwraps[msg.sender];
        emit UnwrapCancelled(msg.sender, amount);
    }

    function emergencyWithdraw(address to_, uint256 amount_) external {
        require(factory.isPaused(address(this)), "Vault is not paused");
        require(msg.sender == address(factory), "Only VaultsFactory can perform emergency withdrawal");
        require(to_ != address(0), "Zero address not allowed");

        uint256 withdrawalAmount = (amount_ == 0) ? underlyingToken.balanceOf(address(this)) : amount_;
        underlyingToken.safeTransfer(to_, withdrawalAmount);
    }
}
