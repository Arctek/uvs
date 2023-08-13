// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./IVaultsFactory.sol";
import "./IVault.sol";
import "./IWETH.sol";


contract VaultImplementation is IVault, Initializable, ERC20Upgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

    IERC20MetadataUpgradeable public underlyingToken;
    IVaultsFactory public factory;
    bool public isEth;

    bool public emergency = false;

    struct PendingUnwrap {
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => PendingUnwrap) public pendingUnwraps;

    event Wrapped(address indexed user, uint256 amount);
    event UnwrapRequested(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event UnwrapCancelled(address indexed user, uint256 amount);

    modifier notPaused() {
        require(!factory.isPaused(this), "VAULTS: OPERATION_PAUSED");
        require(!emergency, "VAULTS: OPERATION_PAUSED_EMERGENCY");
        _;
    }

    function initialize(address underlyingTokenAddress_, IVaultsFactory factory_, bool isEth_, string memory name_, string memory symbol_) public initializer {
        underlyingToken = IERC20MetadataUpgradeable(underlyingTokenAddress_);
        factory = factory_;
        isEth = isEth_;
        __ERC20_init(
            bytes(name_).length != 0 ? name_ : string(abi.encodePacked("Vaulted ", underlyingToken.symbol())),
            bytes(symbol_).length != 0 ? symbol_ : string(abi.encodePacked("v", underlyingToken.symbol()))
        );
        __ReentrancyGuard_init();
    }

    // only accept ETH via fallback from the WETH contract
    receive() external payable {
        require(isEth, "VAULTS: NOT_ETHER");
        require(msg.sender == address(underlyingToken), "VAULTS: RESTRICTED");
    }

    function decimals() public view virtual override returns (uint8) {
        return underlyingToken.decimals();
    }

    function wrapEther() public payable notPaused nonReentrant {
        require(isEth, "VAULTS: NOT_ETHER");

        IWETH(address(underlyingToken)).deposit{value: msg.value}();

        _wrap(msg.value);
    }

    function wrap(uint256 amount_) public notPaused nonReentrant {
        underlyingToken.safeTransferFrom(msg.sender, address(this), amount_);

        _wrap(amount_);
    }

    function _wrap(uint256 amount_) internal {
        require(amount_ > 0, "VAULTS: INVALID_AMOUNT");

        uint256 fee = (amount_ * factory.feeBasisPoints()) / 10000;
        uint256 afterFeeAmount = amount_ - fee;

        if (fee > 0) {
            address feeReceiver = factory.feeReceiver();
            require(feeReceiver != address(0), "VAULTS: FEE_RECEIVER_NOT_SET");
            underlyingToken.safeTransfer(feeReceiver, fee);
        }

        _mint(msg.sender, afterFeeAmount);
        emit Wrapped(msg.sender, afterFeeAmount);
    }

    function unwrap(uint256 amount_) external notPaused nonReentrant {
        require(amount_ > 0, "VAULTS: INVALID_AMOUNT");
        require(balanceOf(msg.sender) >= amount_, "VAULTS: INSUFFICIENT_BALANCE");
        pendingUnwraps[msg.sender] = PendingUnwrap(amount_, block.timestamp);
        emit UnwrapRequested(msg.sender, amount_);
    }

    function claim() external notPaused nonReentrant {
        require(pendingUnwraps[msg.sender].amount > 0, "VAULTS: NO_UNWRAP_REQUESTED");
        require(block.timestamp >= pendingUnwraps[msg.sender].timestamp + factory.unwrapDelay(), "VAULTS: UNWRAP_DELAY_NOT_MET");

        uint256 amount = pendingUnwraps[msg.sender].amount;
        delete pendingUnwraps[msg.sender];

        _burn(msg.sender, amount);

        if (isEth) {
            IWETH(address(underlyingToken)).withdraw(amount);
            (bool success, ) = msg.sender.call{value:amount}("");
            require(success, "VAULTS: ETH_TRANSFER_FAILED");
        } else {
            underlyingToken.safeTransfer(msg.sender, amount);
        }

        emit Claimed(msg.sender, amount);
    }

    function cancelUnwrap() external notPaused nonReentrant {
        require(pendingUnwraps[msg.sender].amount > 0, "VAULTS: NO_UNWRAP_TO_CANCEL");
        uint256 amount = pendingUnwraps[msg.sender].amount;
        delete pendingUnwraps[msg.sender];
        emit UnwrapCancelled(msg.sender, amount);
    }

    function emergencyWithdraw(address to_, uint256 amount_) external nonReentrant {
        require(factory.isPaused(this), "VAULTS: NOT_PAUSED");
        require(msg.sender == address(factory), "VAULTS: NOT_FACTORY_ADDRESS");
        require(to_ != address(0), "VAULTS: ZERO_ADDRESS");

        emergency = true;

        uint256 withdrawalAmount = (amount_ == 0) ? underlyingToken.balanceOf(address(this)) : amount_;
        underlyingToken.safeTransfer(to_, withdrawalAmount);
    }

    function _beforeTokenTransfer(address from, address /* to */, uint256 amount) internal view override {
        if (from != address(0) && pendingUnwraps[from].amount > 0) {
            require(balanceOf(from) >= amount + pendingUnwraps[from].amount, "VAULTS: TRANSFER_EXCEEDS_BALANCE");
        }
    }

    function isVault() public view returns (bytes32) {
       return keccak256("Vaults.Vault") ^ bytes32(uint256(uint160(address(factory))));
    }
}
