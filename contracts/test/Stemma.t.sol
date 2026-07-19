// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Stemma} from "../src/Stemma.sol";

contract StemmaTest is Test {
    Stemma internal stemma;
    address internal author = address(0xA11CE);
    address internal parentAuthor = address(0xB0B);
    address internal grandparentAuthor = address(0xC0DE);
    address internal caller = address(0xCA11);

    function setUp() public { stemma = new Stemma(); }

    function test_RegisterBaseTool() public {
        vm.prank(author);
        uint256 id = stemma.registerTool("Base", "Description", "https://example.com", 1 ether);
        Stemma.Tool memory tool = stemma.getTool(id);
        assertEq(id, 0);
        assertEq(tool.author, author);
        assertEq(tool.name, "Base");
        assertEq(tool.description, "Description");
        assertEq(tool.endpoint, "https://example.com");
        assertEq(tool.pricePerCall, 1 ether);
        assertFalse(tool.hasParent);
        assertEq(tool.parentId, 0);
        assertEq(tool.upstreamSplitBps, 0);
        assertEq(tool.totalCalls, 0);
        assertEq(tool.totalEarned, 0);
        assertTrue(tool.active);
    }

    function test_RegisterExtension() public {
        vm.prank(parentAuthor);
        stemma.registerTool("Base", "", "https://base.example", 1 ether);
        vm.prank(author);
        uint256 id = stemma.registerExtension("Extension", "", "https://ext.example", 2 ether, 0, 2500);
        Stemma.Tool memory tool = stemma.getTool(id);
        assertEq(tool.parentId, 0);
        assertEq(tool.upstreamSplitBps, 2500);
    }

    function test_CycleDetection() public {
        vm.prank(author);
        stemma.registerTool("Base", "", "https://base.example", 1 ether);
        vm.prank(author);
        vm.expectRevert("Cycle: you already appear in this chain");
        stemma.registerExtension("Extension", "", "https://ext.example", 1 ether, 0, 2500);
    }

    function test_RecordCall_BaseOnly() public {
        vm.prank(author);
        stemma.registerTool("Base", "", "https://base.example", 1 ether);
        vm.deal(caller, 1 ether);
        vm.prank(caller);
        stemma.deposit{value: 1 ether}();
        stemma.recordCall(0, caller);
        assertEq(stemma.pendingWithdrawals(author), 0.98 ether);
        assertEq(stemma.pendingWithdrawals(address(this)), 0.02 ether);
    }

    function test_RecordCall_TwoLayer() public {
        vm.prank(parentAuthor);
        stemma.registerTool("Base", "", "https://base.example", 1 ether);
        vm.prank(author);
        stemma.registerExtension("Extension", "", "https://ext.example", 1 ether, 0, 2500);
        vm.deal(caller, 1 ether);
        vm.prank(caller);
        stemma.deposit{value: 1 ether}();
        stemma.recordCall(1, caller);
        assertEq(stemma.pendingWithdrawals(author), 0.735 ether);
        assertEq(stemma.pendingWithdrawals(parentAuthor), 0.245 ether);
        assertEq(stemma.pendingWithdrawals(address(this)), 0.02 ether);
    }

    function test_RecordCall_ThreeLayer() public {
        vm.prank(grandparentAuthor);
        stemma.registerTool("Root", "", "https://root.example", 1 ether);
        vm.prank(parentAuthor);
        stemma.registerExtension("Parent", "", "https://parent.example", 1 ether, 0, 2000);
        vm.prank(author);
        stemma.registerExtension("Leaf", "", "https://leaf.example", 1 ether, 1, 3000);
        vm.deal(caller, 1 ether);
        vm.prank(caller);
        stemma.deposit{value: 1 ether}();
        stemma.recordCall(2, caller);
        assertEq(stemma.pendingWithdrawals(author), 0.686 ether);
        assertEq(stemma.pendingWithdrawals(parentAuthor), 0.2352 ether);
        assertEq(stemma.pendingWithdrawals(grandparentAuthor), 0.0588 ether);
        assertEq(stemma.pendingWithdrawals(address(this)), 0.02 ether);
    }

    function test_InsufficientBalance() public {
        vm.prank(author);
        stemma.registerTool("Base", "", "https://base.example", 1 ether);
        vm.expectRevert("Insufficient balance");
        stemma.recordCall(0, caller);
    }

    function test_Withdraw() public {
        vm.prank(author);
        stemma.registerTool("Base", "", "https://base.example", 1 ether);
        vm.deal(caller, 1 ether);
        vm.prank(caller);
        stemma.deposit{value: 1 ether}();
        stemma.recordCall(0, caller);
        uint256 beforeBalance = author.balance;
        vm.prank(author);
        stemma.withdraw();
        assertEq(stemma.pendingWithdrawals(author), 0);
        assertEq(author.balance, beforeBalance + 0.98 ether);
    }

    function test_GetAncestorChain() public {
        vm.prank(grandparentAuthor);
        stemma.registerTool("Root", "", "https://root.example", 1 ether);
        vm.prank(parentAuthor);
        stemma.registerExtension("Parent", "", "https://parent.example", 1 ether, 0, 2000);
        vm.prank(author);
        stemma.registerExtension("Leaf", "", "https://leaf.example", 1 ether, 1, 3000);
        (uint256[] memory ids, address[] memory authors, uint256[] memory splits) = stemma.getAncestorChain(2);
        assertEq(ids.length, 3);
        assertEq(ids[0], 2);
        assertEq(ids[1], 1);
        assertEq(ids[2], 0);
        assertEq(authors[0], author);
        assertEq(authors[1], parentAuthor);
        assertEq(authors[2], grandparentAuthor);
        assertEq(splits[0], 3000);
        assertEq(splits[1], 2000);
        assertEq(splits[2], 0);
    }
}
