// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./IVaultsFactory.sol";
import "./IVault.sol";

contract VaultsFactory is IVaultsFactory, AccessControlEnumerable {
    address public vaultsImplementation;
    uint256 public unwrapDelay;

    mapping(address => bool) public pausedVaults;
    bool public allVaultsPaused = false;

    // Role identifiers for pausing, deploying, and admin actions
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");
    bytes32 public constant UNPAUSE_ROLE = keccak256("UNPAUSE_ROLE");
    bytes32 public constant DEPLOY_ROLE = keccak256("DEPLOY_ROLE");

    event VaultDeployed(address vaultAddress);
    event VaultPaused(address vaultAddress);
    event VaultUnpaused(address vaultAddress);
    event AllVaultsPaused();
    event AllVaultsUnpaused();

    constructor(
        address vaultsImplementationAddress_,
        uint256 unwrapDelay_,
        address rolesAddr_
    ) {
        vaultsImplementation = vaultsImplementationAddress_;
        unwrapDelay = unwrapDelay_;

        _setupRole(DEFAULT_ADMIN_ROLE, rolesAddr_);
        _setupRole(PAUSE_ROLE, rolesAddr_);
        _setupRole(UNPAUSE_ROLE, rolesAddr_);
        _setupRole(DEPLOY_ROLE, rolesAddr_);
    }

    function deployVault(address underlyingToken_) external onlyRole(DEPLOY_ROLE) returns (address) {
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            vaultsImplementation,
            msg.sender,
            ""
        );
        IVault(address(proxy)).initialize(underlyingToken_, this);
        emit VaultDeployed(address(proxy));
        return address(proxy);
    }

    function pauseVault(address vaultAddress_) external onlyRole(PAUSE_ROLE) {
        pausedVaults[vaultAddress_] = true;
        emit VaultPaused(vaultAddress_);
    }

    function unpauseVault(address vaultAddress_) external onlyRole(UNPAUSE_ROLE) {
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

    function isPaused(address vaultAddress_) public view returns (bool) {
        return allVaultsPaused || pausedVaults[vaultAddress_];
    }

    function setUnwrapDelay(uint256 unwrapDelay_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        unwrapDelay = unwrapDelay_;
    }

    function setVaultsImplementation(address vaultsImplementation_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(vaultsImplementation_ != address(0), "Zero address");
        vaultsImplementation = vaultsImplementation_;
    }

    function emergencyWithdrawFromVault(address vaultAddress, address to_, uint256 amount_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IVault(vaultAddress).emergencyWithdraw(to_, amount_);
    }
}