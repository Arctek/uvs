// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IVaultsFactory.sol";

interface IVault {
    function emergencyWithdraw(address to_, uint256 amount_) external;

    // must return keccak256("Vaults.Vault") ^ bytes32(uint256(uint160(address(VaultsFactory))))
    function isVault() external view returns (bytes32);
}
