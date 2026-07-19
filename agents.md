# agents.md — Stemma

You are building **Stemma** autonomously on a Windows machine with Git Bash / WSL.
Read this file fully before writing a single line of code. Re-read it any time you
are unsure what to do next or have just completed a phase.

---

## What You Are Building

Stemma is a composable MCP extension graph with on-chain revenue splitting on Monad.

The core idea: MCP tool servers can be extended by the community. When you register an
extension, you declare which tool you extend and what % of your call fee flows upstream.
Every call through any level of the graph automatically splits MON across every author
in the chain. The graph, the pricing, and the payment history are all on-chain.

Three deliverables:
1. `Stemma.sol` — deployed to Monad testnet
2. Frontend — Next.js 15 marketplace + graph explorer
3. MCP server — TypeScript, deployed to Railway with a live HTTPS URL

---

## Environment

- OS: Windows with Git Bash or WSL (use whichever has `forge` and `node` available)
- Foundry is installed: `forge`, `cast`, `anvil` all work
- Node.js 20+ is installed
- Railway CLI is installed and logged in
- Git is configured with user name and email
- A GitHub repo named `stemma` exists and is the git remote

### Credentials (already in .env files — do not regenerate or overwrite)

The `.env` files will exist at these paths when you start. Read them; never log or
print private key values.

```
contracts/.env          → PRIVATE_KEY, RPC_URL
mcp-server/.env         → SERVER_PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS (blank until Phase 1 done)
frontend/.env.local     → NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_RPC_URL,
                          NEXT_PUBLIC_CONTRACT_ADDRESS (blank until Phase 1 done)
```

After you deploy the contract in Phase 1, you MUST:
1. Read the deployed address from forge output
2. Write it to `mcp-server/.env` as `CONTRACT_ADDRESS=0x...`
3. Write it to `frontend/.env.local` as `NEXT_PUBLIC_CONTRACT_ADDRESS=0x...`

Do not proceed to Phase 2 until both files are updated.

### Chain Config (hardcode everywhere, never make configurable)
```
Chain ID:    10143
RPC URL:     https://testnet-rpc.monad.xyz
Token:       MON (18 decimals)
Explorer:    https://testnet.monadexplorer.com
```

---

## Repo Structure

Create this exact structure. Do not deviate.

```
stemma/
├── contracts/
│   ├── src/Stemma.sol
│   ├── script/Deploy.s.sol
│   ├── test/Stemma.t.sol
│   └── foundry.toml
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── extend/page.tsx
│   │   │   ├── tool/[id]/page.tsx
│   │   │   └── dashboard/page.tsx
│   │   ├── components/
│   │   │   ├── GraphCanvas.tsx
│   │   │   ├── ToolRow.tsx
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── DepositModal.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   ├── SplitBar.tsx
│   │   │   └── LiveFeed.tsx
│   │   ├── lib/
│   │   │   ├── contract.ts
│   │   │   ├── monad.ts
│   │   │   └── graph.ts
│   │   └── styles/globals.css
│   ├── next.config.ts
│   └── package.json
├── mcp-server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── registry.ts
│   │   └── tools/summarize.ts
│   ├── package.json
│   └── tsconfig.json
├── .env.example
├── agents.md          ← this file
└── README.md
```

---

## Phase 0 — Repo Init (do this first, takes 5 min)

```bash
mkdir stemma && cd stemma
git init
git remote add origin https://github.com/YOUR_HANDLE/stemma.git
```

Create `.env.example`:
```bash
# contracts/.env
PRIVATE_KEY=0x...
RPC_URL=https://testnet-rpc.monad.xyz

# mcp-server/.env
SERVER_PRIVATE_KEY=0x...
CONTRACT_ADDRESS=
RPC_URL=https://testnet-rpc.monad.xyz

# frontend/.env.local
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_CONTRACT_ADDRESS=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Commit: `git commit -m "init: repo structure and env example"`

---

## Phase 1 — Smart Contract

### foundry.toml
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"

[rpc_endpoints]
monad_testnet = "https://testnet-rpc.monad.xyz"
```

### Stemma.sol

Write this contract exactly. Do not simplify, do not add features.

```solidity
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
        return all;
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
```

### Tests — write all of these in Stemma.t.sol

- `test_RegisterBaseTool` — registers, reads back, checks all fields
- `test_RegisterExtension` — registers base then extension, checks parentId + upstreamSplitBps
- `test_CycleDetection` — same address cannot extend their own chain, expect revert
- `test_RecordCall_BaseOnly` — deposit, recordCall, check pendingWithdrawals[author] and [owner]
- `test_RecordCall_TwoLayer` — two layers, verify both authors credited with correct amounts
- `test_RecordCall_ThreeLayer` — three layers, amounts compound correctly
- `test_InsufficientBalance` — recordCall with zero balance, expect revert "Insufficient balance"
- `test_Withdraw` — pendingWithdrawals credited, withdraw(), balance zeroed, ETH transferred
- `test_GetAncestorChain` — returns correct ids/authors/splits from leaf to root

Run: `forge test -vv`
All tests must pass before deployment.

### Deploy

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Read the deployed address from output. Write it immediately:
```bash
# In mcp-server/.env
echo "CONTRACT_ADDRESS=0xYOUR_ADDRESS" >> ../mcp-server/.env

# In frontend/.env.local
echo "NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_ADDRESS" >> ../frontend/.env.local
```

Commit: `git commit -m "feat(contracts): deploy Stemma to Monad testnet 0xADDRESS"`

### Phase 1 checkpoint — do not continue until ALL of these are true:
- [ ] `forge test` passes with all 9 tests green
- [ ] Contract address written to both .env files
- [ ] Deploy tx visible on https://testnet.monadexplorer.com

---

## Phase 2 — Frontend

### Install
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
npm install viem wagmi @rainbow-me/rainbowkit d3 @types/d3
```

Rename `src/` folder contents to match the repo structure above.

### lib/monad.ts
```typescript
import { defineChain } from 'viem'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
})
```

### lib/contract.ts
```typescript
import { createPublicClient, http, parseAbi } from 'viem'
import { monadTestnet } from './monad'

export const STEMMA_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`

export const STEMMA_ABI = parseAbi([
  'function getAllTools() view returns (tuple(address author, string name, string description, string endpoint, uint256 pricePerCall, bool hasParent, uint256 parentId, uint256 upstreamSplitBps, uint256 totalCalls, uint256 totalEarned, bool active)[])',
  'function getTool(uint256) view returns (tuple(address author, string name, string description, string endpoint, uint256 pricePerCall, bool hasParent, uint256 parentId, uint256 upstreamSplitBps, uint256 totalCalls, uint256 totalEarned, bool active))',
  'function getAncestorChain(uint256) view returns (uint256[] ids, address[] authors, uint256[] splits)',
  'function callerBalances(address) view returns (uint256)',
  'function pendingWithdrawals(address) view returns (uint256)',
  'function toolCount() view returns (uint256)',
  'function registerTool(string name, string description, string endpoint, uint256 pricePerCall) returns (uint256)',
  'function registerExtension(string name, string description, string endpoint, uint256 pricePerCall, uint256 parentId, uint256 upstreamSplitBps) returns (uint256)',
  'function deposit() payable',
  'function withdraw()',
  'function recordCall(uint256 toolId, address caller)',
  'event ToolRegistered(uint256 indexed toolId, address indexed author, string name, uint256 pricePerCall, bool hasParent, uint256 parentId, uint256 upstreamSplitBps)',
  'event CallRecorded(uint256 indexed toolId, address indexed caller, uint256 totalFee, uint256 depth)',
  'event SplitPaid(uint256 indexed toolId, address indexed recipient, uint256 amount)',
])

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
})
```

---

### Design System — implement exactly, no deviations

Add to `globals.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');

:root {
  --bg:         #FAFAF8;
  --surface:    #F2F1EE;
  --border:     #E2E0DB;
  --text:       #1A1917;
  --muted:      #7A7672;
  --accent:     #5B4FE8;
  --accent-2:   #12B76A;
  --mon:        #8B5CF6;
  --error:      #D92D20;
  --split-line: #C4BAF5;

  --text-xs:   11px;
  --text-sm:   13px;
  --text-base: 15px;
  --text-lg:   18px;
  --text-xl:   24px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, 'Inter', sans-serif;
  font-size: var(--text-base);
  line-height: 1.6;
}

.mono { font-family: 'IBM Plex Mono', monospace; }
.mon-amount { font-family: 'IBM Plex Mono', monospace; color: var(--mon); }
.muted { color: var(--muted); }

.container { max-width: 1024px; margin: 0 auto; padding: 0 48px; }
@media (max-width: 768px) { .container { padding: 0 16px; } }

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 6px; font-size: var(--text-sm);
  font-weight: 500; cursor: pointer; border: 1px solid transparent;
  transition: opacity 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border); }
.btn-secondary:hover:not(:disabled) { background: var(--border); }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 20px;
}

input, textarea, select {
  width: 100%; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg); color: var(--text);
  font-size: var(--text-sm); font-family: inherit;
}
input:focus, textarea:focus { outline: none; border-color: var(--accent); }

label { font-size: var(--text-sm); font-weight: 500; display: block; margin-bottom: 4px; }

.divider { border: none; border-top: 1px solid var(--border); margin: 24px 0; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.live-dot { animation: pulse-dot 1.4s ease-in-out infinite; }
```

---

### Pages

#### app/page.tsx — Marketplace

Structure:
1. `<Header>` — "Stemma" wordmark left, ConnectWallet right
2. `<LiveFeed>` — full-width ticker strip below header
3. Hero block — 2-line headline, 1-line subhead, two CTAs
4. Tool table — HN-style rows via `<ToolRow>`

Hero copy (use exactly):
```
MCP tools that pay every author in the stack.
Register a base tool or extend any listed server.
Revenue splits automatically on-chain, every call.
```

Tool table columns: `#` | `Name` | `Extends` | `Split` | `Calls` | `MON/call`

The `Extends` cell: if base tool, show `base` in muted text. If extension, show
`#parentId` as a clickable link to `/tool/[parentId]`.

Data source: `getAllTools()` via `publicClient.readContract`. Poll every 15 seconds
with `setInterval`. No SWR, no React Query — keep deps minimal.

#### app/extend/page.tsx — Register Tool

Single column, max-width 560px centered.

Step 1: radio selector — "New base tool" / "Extension of existing tool"

Form fields (always visible):
- Tool name (text input)
- Description (textarea, maxLength=140, show char counter)
- MCP server endpoint (URL input, validate starts with https://)
- Price per call (number input in MON, show `≈ $X.XX USD` below — fetch MON price
  from CoinGecko free API: `https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd`
  or hardcode $2.50/MON if API fails)

Extension-only fields (conditionally visible when "Extension" selected):
- Parent tool ID (number input + live preview: fetch tool name/author/price)
- Upstream split % (range slider 1–60, show number input synced)
- Earnings breakdown card (live calculation, updates on every keystroke):
  ```
  Your price per call:     X.XXXX MON
  − upstream split (N%):  -X.XXXX MON
  − platform fee (2%):    -X.XXXX MON
  ─────────────────────────────────
  You receive per call:    X.XXXX MON
  ```

On submit:
- If base: call `registerTool(name, desc, endpoint, priceInWei)`
- If extension: call `registerExtension(name, desc, endpoint, priceInWei, parentId, splitBps)`
- Show pending state: "Confirming on Monad..." with spinner
- On success: show tool ID, Claude Desktop config snippet, link to tool page
- On revert: parse error message, show in red

#### app/tool/[id]/page.tsx — Tool Detail

Split layout: left 58%, right 42% sticky.

Left side (top to bottom):
1. Tool name (xl), Tool #ID (muted mono, right-aligned same line)
2. `by 0x...truncated` (muted, links to etherscan equiv) | `X.XXXX MON/call` (mon-amount)
3. Description paragraph
4. `Endpoint: https://...` (mono, small)
5. `X,XXX calls · X.XXX MON earned · active`
6. Divider
7. **Extension chain section** — heading "Extension chain", then `<GraphCanvas>`
8. Divider
9. Recent activity table — last 10 `CallRecorded` events for this toolId

Right side (sticky, top: 24px):
```
card: "Fund calls to this tool"
  Your balance: X.XXXX MON (≈ N calls remaining)
  [input: MON amount] [Deposit MON button]
  divider
  "Fee breakdown per call:"
    → N% to #ID (tool name)     ← generated from getAncestorChain()
    → N% to #ID (parent name)
    → 2% platform
```

`getAncestorChain()` is the data source for the fee breakdown. Walk the chain and
calculate each layer's actual % of the original fee.

#### app/dashboard/page.tsx — Author Earnings

Requires wallet connected. If not: show "Connect your wallet to view earnings."

Summary bar:
```
card:
  Total earned (all tools):   X.XXX MON ≈ $X.XX
  Claimable now:              X.XXX MON ≈ $X.XX
  [Withdraw X.XXX MON]  ← disabled if claimable === 0
```

"Your listed tools" table — filter `getAllTools()` where `author === connectedAddress`:
columns: Name | Type | Calls | Earned | Price/call

Type column: "base" if no parent, "ext→#parentId" if extension.

"Upstream earnings" section — scan `getAllTools()` for tools where:
`tool.hasParent && tools[tool.parentId].author === connectedAddress`
Show: Tool name | Extends you (→#myToolId) | their Calls | MON received upstream

MON received upstream per tool = sum of `SplitPaid` events where
`recipient === connectedAddress AND toolId === theirToolId`.
Use `publicClient.getLogs` with the SplitPaid event signature.

---

### Component Specs

#### GraphCanvas.tsx

Use D3. Import: `import * as d3 from 'd3'`

Input props: `{ toolId: number, highlightId: number }`

Data: call `getAncestorChain(toolId)` on mount. Build nodes array and links array.

Layout: manual vertical layout (not force-directed). Root (base tool) at bottom,
extensions stack upward. Fixed positions: each node 80px apart vertically, centered
horizontally. Container: full width, height = (depth * 80) + 60px, min 160px.

Node style:
- Rect: 160px × 44px, rx=4, fill=var(--surface), stroke=var(--border)
- If node === highlightId: stroke=var(--accent), strokeWidth=2
- Text: tool name (13px Inter) top line, `#ID` (11px mono, muted) bottom line
- Clickable: `onClick={() => router.push('/tool/' + id)}`

Edge style:
- Straight line, stroke=var(--split-line), strokeWidth=1.5
- Arrowhead marker at midpoint pointing upward
- Edge label: `N% ↑` centered on edge, 11px mono, color=var(--muted)

Live animation: accept prop `onCallEvent: Observable | null`. When a `CallRecorded`
event fires for this toolId, animate a circle (r=5, fill=var(--accent), opacity=0.6)
along each edge from leaf to root, 400ms per edge, sequential.

Simplest implementation: use `useEffect` to watch for new `CallRecorded` events via
polling getLogs. On new event, trigger animation via local state.

#### LiveFeed.tsx

Poll `getLogs` for `CallRecorded` events every 8 seconds. Keep last 5.

Desktop: flex row of 5 items, each formatted as:
`[LIVE] {toolName} · {caller[0..6]}...{caller[-4]} · {formatMON(fee)} MON · {timeAgo}s ago`

The `[LIVE]` badge: red dot (8px circle, `var(--error)`) with class `live-dot` for
pulse animation + text "LIVE" in mono caps, 11px.

Mobile: CSS scroll marquee (overflow-x: auto, white-space: nowrap).

Strip styles: background=var(--surface), border-bottom=1px solid var(--border),
padding=8px container, font-size=11px mono, color=var(--muted).

#### SplitBar.tsx

Props: `{ layers: { label: string, pct: number, color: string }[] }`

Render a horizontal bar divided into segments. Each segment: width=pct%, background=color,
min-width enough for the label. Below each segment: label + pct% in 11px mono.

Colors to use: your share=var(--accent-2), parent shares=var(--accent),
great-grandparent=var(--split-line), platform=var(--border).

#### WalletConnect.tsx

Use RainbowKit `ConnectButton`. Wrap with monadTestnet as the only chain.

Wrong network detection: use wagmi `useChainId`. If `chainId !== 10143`, show:
```html
<div style="background: #FFF3EE; border-bottom: 1px solid #FFD4B8; padding: 10px 0;">
  <div class="container" style="display:flex; align-items:center; gap:12px;">
    <span style="font-size:13px;">You're on the wrong network.</span>
    <button class="btn btn-secondary" style="font-size:12px;" onClick={switchToMonad}>
      Switch to Monad Testnet
    </button>
  </div>
</div>
```

Use wagmi `useSwitchChain` for the switch action.

---

### State Handling Rules — enforce these everywhere

| Situation | What to show |
|---|---|
| Wallet not connected | Replace any action button with "Connect wallet" — never show an error, never crash |
| Wrong network | Full-width banner above page content, disable all write actions |
| Tx pending | Disable submit, show "Confirming on Monad…" with inline spinner |
| Tx success | Green toast bottom-right, auto-dismiss 4s, refresh relevant data |
| Tx reverted | Red toast with the revert reason string parsed from the error |
| Contract read fails | Retry silently up to 3x, then show "Failed to load — retry" inline |
| Tool not found | `/tool/[id]` shows: "Tool #N not found." with link to marketplace |
| Empty marketplace | "No tools listed yet. Be the first to register one." with CTA |
| Empty dashboard | "You haven't listed any tools yet." with CTA |
| Insufficient balance | Show remaining calls in red: "0 calls remaining — deposit to continue" |

Toast implementation: simple fixed-position div, bottom-right, z-index 9999,
slide-in CSS animation. No toast library.

---

### Phase 2 checkpoint:
- [ ] `npm run dev` starts without errors
- [ ] Wallet connects to Monad Testnet
- [ ] Tool list loads from contract (even if empty)
- [ ] Register form submits a tx that confirms on explorer
- [ ] Tool detail page loads with graph
- [ ] Deposit widget sends correct MON amount
- [ ] Dashboard shows correct earnings for connected wallet

Commit at each checkpoint: `git commit -m "feat(frontend): [page name] complete"`

---

## Phase 3 — MCP Server

### Setup
```bash
cd mcp-server
npm init -y
npm install @modelcontextprotocol/sdk viem dotenv
npm install -D typescript @types/node tsx
```

tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src"]
}
```

package.json scripts:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "type": "module"
}
```

### src/registry.ts

```typescript
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import 'dotenv/config'

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
} as const

const STEMMA_ADDRESS = process.env.CONTRACT_ADDRESS as `0x${string}`

const ABI = parseAbi([
  'function callerBalances(address) view returns (uint256)',
  'function getTool(uint256) view returns (tuple(address author, string name, string description, string endpoint, uint256 pricePerCall, bool hasParent, uint256 parentId, uint256 upstreamSplitBps, uint256 totalCalls, uint256 totalEarned, bool active))',
  'function recordCall(uint256 toolId, address caller) external',
])

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() })

const account = privateKeyToAccount(process.env.SERVER_PRIVATE_KEY as `0x${string}`)
const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http() })

export async function checkBalance(caller: string, toolId: bigint): Promise<boolean> {
  const [balance, tool] = await Promise.all([
    publicClient.readContract({ address: STEMMA_ADDRESS, abi: ABI, functionName: 'callerBalances', args: [caller as `0x${string}`] }),
    publicClient.readContract({ address: STEMMA_ADDRESS, abi: ABI, functionName: 'getTool', args: [toolId] }),
  ])
  return (balance as bigint) >= (tool as any).pricePerCall
}

export async function recordCall(toolId: bigint, caller: string): Promise<string> {
  return walletClient.writeContract({
    address: STEMMA_ADDRESS, abi: ABI,
    functionName: 'recordCall', args: [toolId, caller as `0x${string}`],
  })
}
```

### src/index.ts

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { checkBalance, recordCall } from './registry.js'

const server = new Server(
  { name: 'stemma-demo', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

const insufficientBalance = (toolId: number) => ({
  content: [{ type: 'text' as const, text: `Insufficient balance. Deposit MON at ${process.env.APP_URL ?? 'https://stemma.vercel.app'}/tool/${toolId}` }],
  isError: true,
})

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'summarize_text',
      description: 'Summarizes any text into 2 sentences. Costs 0.0010 MON per call (Tool #0 on Stemma).',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to summarize' },
          caller_address: { type: 'string', description: 'Your Monad wallet address for billing' },
        },
        required: ['text', 'caller_address'],
      },
    },
    {
      name: 'summarize_text_pro',
      description: 'Summarizes text with configurable sentence count. 0.0015 MON/call. Extends Tool #0 with 25% upstream split (Tool #1 on Stemma).',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          sentences: { type: 'number', default: 3 },
          caller_address: { type: 'string' },
        },
        required: ['text', 'caller_address'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const caller = (args as any).caller_address as string

  if (name === 'summarize_text') {
    if (!(await checkBalance(caller, 0n))) return insufficientBalance(0)
    await recordCall(0n, caller)
    return { content: [{ type: 'text', text: extractSummary((args as any).text, 2) }] }
  }

  if (name === 'summarize_text_pro') {
    if (!(await checkBalance(caller, 1n))) return insufficientBalance(1)
    await recordCall(1n, caller)
    return { content: [{ type: 'text', text: extractSummary((args as any).text, (args as any).sentences ?? 3) }] }
  }

  throw new Error(`Unknown tool: ${name}`)
})

function extractSummary(text: string, n: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  return sentences.slice(0, n).join(' ').trim()
}

await server.connect(new StdioServerTransport())
```

### Deploy to Railway

```bash
cd mcp-server
railway init          # creates project, select "Empty project"
railway variables set CONTRACT_ADDRESS=0xYOUR_CONTRACT
railway variables set SERVER_PRIVATE_KEY=0xYOUR_KEY
railway variables set APP_URL=https://stemma.vercel.app
railway up
```

Railway will give you a public URL like `https://stemma-mcp-production.up.railway.app`.
This is the endpoint to register as Tool #0 and Tool #1 on the frontend.

### Phase 3 checkpoint:
- [ ] `npm run dev` starts MCP server without errors
- [ ] `checkBalance` returns correct value for a test address
- [ ] Railway deploy succeeds, URL is live and returns HTTP 200
- [ ] MCP server is registered as Tool #0 on Stemma via the frontend

---

## Phase 4 — End-to-End Test

Do this manually or via script. Every step must produce a real on-chain transaction.

1. Open frontend at localhost:3000
2. Connect MetaMask (Monad Testnet)
3. Go to /tool/1 — deposit 0.05 MON
4. Verify `callerBalances[yourAddress]` increased on explorer
5. Call `summarize_text_pro` from Claude Desktop with your wallet address
6. Verify `recordCall` tx on explorer — check it emits `SplitPaid` twice (Tool #1 author + Tool #0 author)
7. Go to /dashboard — verify both earnings show up
8. Click Withdraw — verify MON arrives in wallet

If any step fails, debug before proceeding to Phase 5.

---

## Phase 5 — Polish + README

### README.md — write this exactly, fill in real values

```markdown
# Stemma — Composable MCP Extension Graph on Monad

## The Problem
Open source created the software internet and left its contributors unpaid.
The same is happening to MCP: thousands of servers exist, almost none earn revenue,
and the developers who add the most value — by extending and improving existing tools
— are invisible and uncompensated.

## The Solution
Stemma is an on-chain protocol where every MCP extension inherits economic rights
from the tool it builds on. Every call through the stack automatically splits MON
across every author in the graph. The split rules live on Monad — immutable,
auditable, 300ms settlement.

## Why Monad
Multi-party micropayment splits are economically broken on most EVM chains. A $0.003
fee split across four authors requires four state writes — on Ethereum mainnet, those
writes cost more than the fee. Monad's optimistic parallel execution processes
non-conflicting state updates simultaneously. A four-way split takes the same
wall-clock time as a single transfer. This architecture only works economically here.

## How It Works
1. Register a base tool or extend an existing one — declare your upstream split %
2. Agent operators deposit MON into Stemma
3. MCP server checks balance, serves the tool, calls recordCall()
4. Stemma walks the extension graph and splits MON to every author automatically
5. Authors withdraw accumulated MON any time

## Live
- App: YOUR_VERCEL_URL
- Contract: YOUR_CONTRACT_ADDRESS
- Explorer: https://testnet.monadexplorer.com/address/YOUR_CONTRACT_ADDRESS

## Try It (Claude Desktop)
Add to claude_desktop_config.json:
{
  "mcpServers": {
    "stemma-demo": {
      "url": "YOUR_RAILWAY_URL/mcp",
      "transport": "http"
    }
  }
}
Then ask Claude: "Summarize this text using summarize_text_pro with caller_address YOUR_WALLET"

## Stack
- Solidity + Foundry (Monad testnet)
- Next.js 15, TypeScript, Tailwind CSS, wagmi v2, viem, RainbowKit, D3.js
- @modelcontextprotocol/sdk, Railway

## Local Setup
git clone https://github.com/YOUR_HANDLE/stemma && cd stemma

# Contract
cd contracts && cp .env.example .env
forge install && forge test && forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast

# Frontend
cd ../frontend && cp .env.example .env.local  # add contract address
npm install && npm run dev

# MCP server
cd ../mcp-server && cp .env.example .env  # add contract address + server key
npm install && npm run dev
```

### Final checklist before submit:

```
[ ] forge test — all 9 tests green
[ ] Contract address in README, page footer, and explorer link
[ ] Live app URL works and loads tool list from chain
[ ] GraphCanvas renders on /tool/1 with real data
[ ] Dot animation fires on real CallRecorded events
[ ] /extend form submits and confirms for both base and extension
[ ] Deposit widget sends correct MON
[ ] Dashboard shows earnings + upstream earnings
[ ] Withdraw drains pendingWithdrawals correctly
[ ] MCP server live on Railway, registered on Stemma
[ ] End-to-end tx visible on explorer: recordCall with 2x SplitPaid events
[ ] README complete with real contract address, live URL, demo instructions
[ ] GitHub repo public with clean commit history
[ ] No hardcoded fake data anywhere in the frontend
[ ] All error states handled (wrong network, no balance, tx revert)
[ ] Mobile layout not broken
```

---

## Commit Convention

Use these prefixes so the history is readable for judges:
```
init:         repo setup
feat(contracts): contract work
feat(frontend): frontend work
feat(mcp):    mcp server work
fix:          bug fixes
docs:         readme / comments
deploy:       deployment commits
```

---

## If You Get Stuck

- RPC rate limited: add 1s delay between reads, or switch RPC to a fallback
- `forge script` fails: check PRIVATE_KEY in contracts/.env has the `0x` prefix
- wagmi hooks error: ensure RainbowKit `WagmiProvider` wraps the entire app in layout.tsx
- D3 SSR error in Next.js: wrap GraphCanvas in `dynamic(() => import(...), { ssr: false })`
- Railway deploy fails: check `railway variables` has all three env vars set
- MCP server not found by Claude Desktop: restart Claude Desktop after config change

---

*Stemma. Every author in the stack gets paid.*