// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {Stemma} from "../src/Stemma.sol";

contract Deploy is Script {
    function run() external returns (Stemma stemma) {
        vm.startBroadcast();
        stemma = new Stemma();
        vm.stopBroadcast();
    }
}
