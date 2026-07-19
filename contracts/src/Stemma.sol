// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Stemma {

    uint256 public constant MAX_DEPTH = 8;
    uint256 public constant MAX_SPLIT_BPS = 6000;
    uint256 public constant PLATFORM_FEE_BPS = 200;

    struct Tool {
        address author;
        string name;
        string description;
        string endpoint;
        uint256 pricePerCall;
        bool hasParent;
        uint256 parentId;
        uint256 upstreamSplitBps;
        uint256 totalCalls;
        uint256 totalEarned;
        bool active;
    }

    mapping(uint256 => Tool) public tools;
    mapping(address => uint256) public callerBalances;
    mapping(address => uint256) public pendingWithdrawals;
    uint256 public toolCount;
    address public owner;

    event ToolRegistered(
        uint256 indexed toolId,
        address indexed author,
        string name,
        uint256 pricePerCall,
        bool hasParent,
        uint256 parentId,
        uint256 upstreamSplitBps
    );
    event CallRecorded(
        uint256 indexed toolId,
        address indexed caller,
        uint256 totalFee,
        uint256 depth
    );
    event SplitPaid(uint256 indexed toolId, address indexed recipient, uint256 amount);
    event Deposited(address indexed caller, uint256 amount);
    event Withdrawn(address indexed author, uint256 amount);

    constructor() { owner = msg.sender; }

    function registerTool(
        string calldata name,
        string calldata description,
        string calldata endpoint,
        uint256 pricePerCall
    ) external returns (uint256 toolId) {
        require(pricePerCall > 0, "Price must be > 0");
        toolId = _createTool(name, description, endpoint, pricePerCall, false, 0, 0);
    }

    function registerExtension(
        string calldata name,
        string calldata description,
        string calldata endpoint,
        uint256 pricePerCall,
        uint256 parentId,
        uint256 upstreamSplitBps
    ) external returns (uint256 toolId) {
        require(pricePerCall > 0, "Price must be > 0");
        require(parentId < toolCount, "Parent does not exist");
        require(tools[parentId].active, "Parent not active");
        require(upstreamSplitBps >= 100, "Min 1% upstream split");
        require(upstreamSplitBps <= MAX_SPLIT_BPS, "Max 60% upstream split");
        _assertNoCycle(parentId, msg.sender);
        toolId = _createTool(name, description, endpoint, pricePerCall, true, parentId, upstreamSplitBps);
    }

    function _createTool(
        string calldata name,
        string calldata description,
        string calldata endpoint,
        uint256 pricePerCall,
        bool hasParent,
        uint256 parentId,
        uint256 upstreamSplitBps
    ) internal returns (uint256 toolId) {
        toolId = toolCount++;
        tools[toolId] = Tool({
            author: msg.sender,
            name: name,
            description: description,
            endpoint: endpoint,
            pricePerCall: pricePerCall,
            hasParent: hasParent,
            parentId: parentId,
            upstreamSplitBps: upstreamSplitBps,
            totalCalls: 0,
            totalEarned: 0,
            active: true
        });
        emit ToolRegistered(toolId, msg.sender, name, pricePerCall, hasParent, parentId, upstreamSplitBps);
    }

    function _assertNoCycle(uint256 startId, address extensionAuthor) internal view {
        uint256 current = startId;
        for (uint256 i = 0; i < MAX_DEPTH; i++) {
            require(tools[current].author != extensionAuthor, "Cycle: you already appear in this chain");
            if (!tools[current].hasParent) break;
            current = tools[current].parentId;
        }
    }

    function deposit() external payable {
        require(msg.value > 0, "Must deposit > 0");
        callerBalances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdrawCallerBalance() external {
        uint256 amount = callerBalances[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        callerBalances[msg.sender] = 0;
        _safeTransfer(msg.sender, amount);
    }

    function recordCall(uint256 toolId, address caller) external {
        Tool storage rootTool = tools[toolId];
        require(rootTool.active, "Tool not active");
        require(callerBalances[caller] >= rootTool.pricePerCall, "Insufficient balance");

        callerBalances[caller] -= rootTool.pricePerCall;
        uint256 remaining = rootTool.pricePerCall;

        uint256 platformFee = (remaining * PLATFORM_FEE_BPS) / 10000;
        pendingWithdrawals[owner] += platformFee;
        remaining -= platformFee;

        uint256 current = toolId;
        uint256 depth = 0;

        while (depth < MAX_DEPTH) {
            Tool storage t = tools[current];
            if (!t.hasParent || remaining == 0) {
                pendingWithdrawals[t.author] += remaining;
                t.totalEarned += remaining;
                emit SplitPaid(current, t.author, remaining);
                remaining = 0;
                break;
            }
            uint256 upstreamAmount = (remaining * t.upstreamSplitBps) / 10000;
            uint256 authorAmount = remaining - upstreamAmount;
            pendingWithdrawals[t.author] += authorAmount;
            t.totalEarned += authorAmount;
            emit SplitPaid(current, t.author, authorAmount);
            remaining = upstreamAmount;
            current = t.parentId;
            depth++;
        }

        if (remaining > 0) pendingWithdrawals[owner] += remaining;
        tools[toolId].totalCalls += 1;
        emit CallRecorded(toolId, caller, rootTool.pricePerCall, depth);
    }

    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        _safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function _safeTransfer(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function getTool(uint256 toolId) external view returns (Tool memory) {
        return tools[toolId];
    }

    function getAllTools() external view returns (Tool[] memory) {
        Tool[] memory all = new Tool[](toolCount);
        for (uint256 i = 0; i < toolCount; i++) { all[i] = tools[i]; }
    }

    function getAncestorChain(uint256 toolId)
        external view
        returns (uint256[] memory ids, address[] memory authors, uint256[] memory splits)
    {
        uint256[] memory tempIds = new uint256[](MAX_DEPTH + 1);
        address[] memory tempAuthors = new address[](MAX_DEPTH + 1);
        uint256[] memory tempSplits = new uint256[](MAX_DEPTH + 1);
        uint256 current = toolId;
        uint256 depth = 0;
        while (depth <= MAX_DEPTH) {
            Tool storage t = tools[current];
            tempIds[depth] = current;
            tempAuthors[depth] = t.author;
            tempSplits[depth] = t.upstreamSplitBps;
            depth++;
            if (!t.hasParent) break;
            current = t.parentId;
        }
        ids = new uint256[](depth);
        authors = new address[](depth);
        splits = new uint256[](depth);
        for (uint256 i = 0; i < depth; i++) {
            ids[i] = tempIds[i];
            authors[i] = tempAuthors[i];
            splits[i] = tempSplits[i];
        }
    }

    receive() external payable {}
}
