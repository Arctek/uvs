// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./IVaultsFactory.sol";
import "./IVault.sol";

contract VaultsFactory is IVaultsFactory, AccessControlEnumerable {
    address public immutable weth;

    address public vaultsImplementation;
    uint256 public unwrapDelay;

    address public feeReceiver;
    uint256 public feeBasisPoints;

    mapping(IVault => bool) public pausedVaults;
    bool public allVaultsPaused = false;

    // Role identifiers for pausing, deploying, and admin actions
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");
    bytes32 public constant UNPAUSE_ROLE = keccak256("UNPAUSE_ROLE");
    bytes32 public constant DEPLOY_ROLE = keccak256("DEPLOY_ROLE");

    event VaultDeployed(IVault vaultAddress);
    event VaultPaused(IVault vaultAddress);
    event VaultUnpaused(IVault vaultAddress);
    event AllVaultsPaused();
    event AllVaultsUnpaused();

    modifier isVault(IVault vault_) {
        try vault_.isVault() returns (bytes32 result) {
            require(vault_.isVault() == keccak256("Vaults.Vault") ^ bytes32(uint256(uint160(address(this)))), "VAULTS: NOT_VAULT");
        } catch {
            revert("VAULTS: NOT_VAULT");
        }
        _;
    }

    constructor(
        address weth_,
        address vaultsImplementationAddress_,
        uint256 unwrapDelay_,
        address rolesAddr_,
        address initialFeeReceiver_,
        uint256 initialFeeBasisPoints_
    ) {
        weth = weth_;
        vaultsImplementation = vaultsImplementationAddress_;
        unwrapDelay = unwrapDelay_;

        _setupRole(DEFAULT_ADMIN_ROLE, rolesAddr_);
        _setupRole(PAUSE_ROLE, rolesAddr_);
        _setupRole(UNPAUSE_ROLE, rolesAddr_);
        _setupRole(DEPLOY_ROLE, rolesAddr_);

        _setFeeReceiver(initialFeeReceiver_);
        _setFeeBasisPoints(initialFeeBasisPoints_);
    }

    function deployVault(address underlyingToken_, string memory name_, string memory symbol_) external onlyRole(DEPLOY_ROLE) returns (IVault result) {
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            vaultsImplementation,
            getRoleMember(DEFAULT_ADMIN_ROLE, 0),
            ""
        );
        result = IVault(address(proxy));
        result.initialize(underlyingToken_, this, underlyingToken_ == weth, name_, symbol_);
        emit VaultDeployed(result);
    }

    function pauseVault(IVault vault_) external onlyRole(PAUSE_ROLE) isVault(vault_) {
        pausedVaults[vault_] = true;
        emit VaultPaused(vault_);
    }

    function unpauseVault(IVault vaultAddress_) external onlyRole(UNPAUSE_ROLE) isVault(vaultAddress_) {
        delete pausedVaults[vaultAddress_];
        emit VaultUnpaused(vaultAddress_);
    }

    function pauseAllVaults() external onlyRole(PAUSE_ROLE) {
        allVaultsPaused = true;
        emit AllVaultsPaused();
    }

    function unpauseAllVaults() external onlyRole(UNPAUSE_ROLE) {
        allVaultsPaused = false;
        emit AllVaultsUnpaused();
    }

    function isPaused(IVault vaultAddress_) public view returns (bool) {
        return allVaultsPaused || pausedVaults[vaultAddress_];
    }

    function setUnwrapDelay(uint256 unwrapDelay_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        unwrapDelay = unwrapDelay_;
    }

    function setVaultsImplementation(address vaultsImplementation_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(vaultsImplementation_ != address(0), "VAULTS: ZERO_ADDRESS");
        vaultsImplementation = vaultsImplementation_;
    }

    function emergencyWithdrawFromVault(IVault vaultAddress_, address to_, uint256 amount_) external onlyRole(DEFAULT_ADMIN_ROLE) isVault(vaultAddress_) {
        vaultAddress_.emergencyWithdraw(to_, amount_);
    }

    function _setFeeReceiver(address feeReceiver_) internal {
        feeReceiver = feeReceiver_;
    }

    function _setFeeBasisPoints(uint256 feeBasisPoints_) internal {
        require(feeBasisPoints_ <= 10000, "VAULTS: EXCESSIVE_FEE_PERCENT");  // Max of 10000 basis points
        feeBasisPoints = feeBasisPoints_;
    }

    function setFeeReceiver(address feeReceiver_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFeeReceiver(feeReceiver_);
    }

    function setFeeBasisPoints(uint256 feeBasisPoints_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFeeBasisPoints(feeBasisPoints_);
    }
}
