// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IVaultsFactory.sol";

interface IVault {
    function initialize(address underlyingToken_, IVaultsFactory factory_) external;
    function emergencyWithdraw(address to_, uint256 amount_) external;
}
