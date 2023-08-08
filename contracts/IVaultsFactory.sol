// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVaultsFactory {
    function unwrapDelay() external view returns (uint256);
    function isPaused(address vault) external view returns (bool);
}
