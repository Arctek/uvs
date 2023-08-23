// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./IVaultsFactory.sol";
import "./IVault.sol";

contract VaultsFactory is IVaultsFactory, AccessControlEnumerable {
    address public immutable weth;

    address public defaultVaultImplementation;
    uint256 public unwrapDelay;

    address public feeReceiver;
    uint256 public feeBasisPoints;

    mapping(IVault => bool) public pausedVaults;
    bool public allVaultsPaused = false;

    // Role identifiers for pausing, deploying, and admin actions
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");
    bytes32 public constant TEAM_ROLE = keccak256("TEAM_ROLE");

    event VaultDeployed(IVault vaultAddress);
    event VaultPaused(IVault vaultAddress);
    event VaultUnpaused(IVault vaultAddress);
    event AllVaultsPaused();
    event AllVaultsUnpaused();

    modifier isVault(IVault vault_) {
        try vault_.isVault() returns (bytes32 result) {
            require(result == keccak256("Vaults.Vault") ^ bytes32(uint256(uint160(address(this)))), "VAULTS: NOT_VAULT");
        } catch {
            revert("VAULTS: NOT_VAULT");
        }
        _;
    }

    constructor(
        address weth_,
        address vaultImplementationAddress_,
        uint256 unwrapDelay_,
        address rolesAddr_,
        address initialFeeReceiver_,
        uint256 initialFeeBasisPoints_
    ) {
        weth = weth_;
        defaultVaultImplementation = vaultImplementationAddress_;
        unwrapDelay = unwrapDelay_;

        _setupRole(DEFAULT_ADMIN_ROLE, rolesAddr_);
        _setupRole(PAUSE_ROLE, rolesAddr_);
        _setupRole(TEAM_ROLE, rolesAddr_);

        _setFeeReceiver(initialFeeReceiver_);
        _setFeeBasisPoints(initialFeeBasisPoints_);
    }

    function deployVault(address underlyingToken_, string memory name_, string memory symbol_) external onlyRole(TEAM_ROLE) returns (IVault result) {
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            defaultVaultImplementation,
            getRoleMember(DEFAULT_ADMIN_ROLE, 0),
            ""
        );
        result = IVault(address(proxy));
        result.initialize(
            underlyingToken_,
            this,
            underlyingToken_ == weth,
            bytes(name_).length != 0 ? name_ : string(abi.encodePacked("Vaulted ", IERC20Metadata(underlyingToken_).symbol())),
            bytes(symbol_).length != 0 ? symbol_ : string(abi.encodePacked("v", IERC20Metadata(underlyingToken_).symbol()))
        );
        emit VaultDeployed(result);
    }

    function pauseVault(IVault vault_) external onlyRole(PAUSE_ROLE) isVault(vault_) {
        pausedVaults[vault_] = true;
        emit VaultPaused(vault_);
    }

    function unpauseVault(IVault vaultAddress_) external onlyRole(DEFAULT_ADMIN_ROLE) isVault(vaultAddress_) {
        delete pausedVaults[vaultAddress_];
        emit VaultUnpaused(vaultAddress_);
    }

    function pauseAllVaults() external onlyRole(PAUSE_ROLE) {
        allVaultsPaused = true;
        emit AllVaultsPaused();
    }

    function unpauseAllVaults() external onlyRole(DEFAULT_ADMIN_ROLE) {
        allVaultsPaused = false;
        emit AllVaultsUnpaused();
    }

    function isPaused(IVault vaultAddress_) public view returns (bool) {
        return allVaultsPaused || pausedVaults[vaultAddress_];
    }

    function setUnwrapDelay(uint256 unwrapDelay_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        unwrapDelay = unwrapDelay_;
    }

    function setDefaultVaultImplementation(address vaultImplementation_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(vaultImplementation_ != address(0), "VAULTS: ZERO_ADDRESS");
        defaultVaultImplementation = vaultImplementation_;
    }

    function emergencyWithdrawFromVault(IVault vaultAddress_, address to_, uint256 amount_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        vaultAddress_.emergencyWithdraw(to_, amount_);
    }

    function _setFeeReceiver(address feeReceiver_) internal {
        feeReceiver = feeReceiver_;
    }

    function _setFeeBasisPoints(uint256 feeBasisPoints_) internal {
        require(feeBasisPoints_ <= 200, "VAULTS: EXCESSIVE_FEE_PERCENT");  // Max 2%
        feeBasisPoints = feeBasisPoints_;
    }

    function setFeeReceiver(address feeReceiver_) external onlyRole(TEAM_ROLE) {
        _setFeeReceiver(feeReceiver_);
    }

    function setFeeBasisPoints(uint256 feeBasisPoints_) external onlyRole(TEAM_ROLE) {
        _setFeeBasisPoints(feeBasisPoints_);
    }
}
