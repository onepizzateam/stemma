# agents.md — Stemma

You are building **Stemma** autonomously on a Windows machine with Git Bash / WSL.
Read this file fully before writing a single line of code. Re-read it any time you
are unsure what to do next or have just completed a phase.

---

## CURRENT STATUS — read this before anything else

Phase 1: DONE
- Contract deployed: 0x17d467d7C58a167637Ce2716BF457C4cDa29F382 on Monad testnet (chain 10143)
- All 9 forge tests pass
- CONTRACT_ADDRESS written to mcp-server/.env and frontend/.env.local

Phase 2: DONE
- Frontend source written and running locally on localhost:3000
- Node 20 LTS installed on machine
- next.config.ts has webpack alias block for Coinbase/x402 stubs — do not remove it
- @tanstack/query-core, @tanstack/react-query, @x402/evm, @x402/core installed

Phase 3: DONE
- MCP server live on Railway: https://stemma-mcp-server-production.up.railway.app
- /health returns 200
- /mcp HTTP transport verified with official MCP client
- SERVER_PRIVATE_KEY and CONTRACT_ADDRESS set in Railway variables

Phase 2.5: NOT STARTED — start here
- MCP auto-discovery feature (paste URL → get real tools → register on chain)
- Full-screen interactive graph explorer
- Deploy frontend to Railway

Phase 4: NOT STARTED
Phase 5: NOT STARTED (README needs real Railway frontend URL)

---

## What You Are Building

Stemma is a composable MCP extension graph with on-chain revenue splitting on Monad.

The core idea: anyone can paste the HTTPS URL of any live MCP server, Stemma
discovers the tools it exposes in real time using the MCP protocol, and the user
registers them on chain with a price and upstream split. Every call through any level
of the graph automatically splits MON across every author in the chain. The graph,
the pricing, and the payment history are all on-chain and visible in an interactive
tree explorer.

Three deliverables:
1. `Stemma.sol` — deployed to Monad testnet ✅
2. Frontend — Next.js 15 marketplace + graph explorer + Railway deploy
3. MCP server — TypeScript, deployed to Railway ✅

---

## Environment

- OS: Windows with Git Bash or WSL
- Node.js 20 LTS is installed and working
- Railway CLI is installed and logged in
- Git is configured
- GitHub repo named `stemma` exists

### Credentials
```
contracts/.env          → PRIVATE_KEY, RPC_URL
mcp-server/.env         → SERVER_PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS
frontend/.env.local     → NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_RPC_URL,
                          NEXT_PUBLIC_CONTRACT_ADDRESS
```
Never overwrite these files wholesale. Never log or print private key values.

### Chain Config (hardcode everywhere, never make configurable)
```
Chain ID:    10143
RPC URL:     https://testnet-rpc.monad.xyz
Token:       MON (18 decimals)
Explorer:    https://testnet.monadexplorer.com
Contract:    0x17d467d7C58a167637Ce2716BF457C4cDa29F382
```

---

## Phase 2.5 — Discovery + Graph + Frontend Deploy

This is the current phase. Complete all three parts before moving to Phase 4.

---

### Part A — MCP Auto-Discovery endpoint on Railway

Add a `GET /discover?url=` route to `mcp-server/src/index.ts`.
Do not remove or modify the existing `/health` or `/mcp` routes.

**Exact implementation:**

```typescript
// Inside the existing HTTP server handler, add this route:
// GET /discover?url=<https_mcp_endpoint>

if (req.method === 'GET' && parsedUrl.pathname === '/discover') {
  const targetUrl = parsedUrl.searchParams.get('url')

  if (!targetUrl || !targetUrl.startsWith('https://')) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'url must be an https MCP endpoint' }))
    return
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    // Step 1: initialize
    const initRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'stemma-discovery', version: '1.0.0' }
        }
      }),
      signal: controller.signal
    })

    // Step 2: tools/list
    const listRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    const listData = await listRes.json() as any
    const tools = listData?.result?.tools ?? []

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(JSON.stringify({
      tools: tools.map((t: any) => ({
        name: t.name,
        description: t.description ?? ''
      }))
    }))
  } catch (err: any) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      error: 'Could not reach MCP server',
      detail: err?.message ?? String(err)
    }))
  }
  return
}
```

After adding this route:
1. `npm run build` in mcp-server
2. `railway up` to redeploy
3. Verify by hitting:
   `https://stemma-mcp-server-production.up.railway.app/discover?url=https://stemma-mcp-server-production.up.railway.app/mcp`
   Must return real tools JSON. If it returns an error, fix it before touching the frontend.

---

### Part B — Frontend /extend page: Discovery UI

Open `frontend/src/app/extend/page.tsx`. Do NOT rewrite it. Add the discovery flow
at the very top of the form, above the existing radio selector.

**Exact UI to add:**

```
┌─────────────────────────────────────────────────────┐
│ Discover tools from an MCP server                   │
│                                                     │
│ [https://your-mcp-server.railway.app/mcp    ] [Discover →] │
│                                                     │
│ idle:    just the input and button                  │
│ loading: button → "Discovering..." disabled         │
│ error:   red text showing exact error from API      │
│          never show fake tools on error             │
│ success: list of tool cards (see below)             │
└─────────────────────────────────────────────────────┘
```

**Tool card (shown on success):**
```
┌─────────────────────────────────────────┐
│  tool_name                              │  ← bold, 14px
│  Description of what the tool does      │  ← muted, 13px
└─────────────────────────────────────────┘
```
- Card has border: 1px solid var(--border), border-radius: 4px, padding: 12px 16px
- On hover: border-color var(--accent)
- On click: border-color var(--accent), border-width 2px (selected state)
- Clicking a card pre-fills:
  - Tool name input → tool.name
  - Description textarea → tool.description
  - MCP server endpoint input → the URL the user typed
  - Price and split are NOT touched — user sets those manually

**Discovery fetch:**
```typescript
const res = await fetch(
  `https://stemma-mcp-server-production.up.railway.app/discover?url=${encodeURIComponent(url)}`
)
const data = await res.json()
if (!res.ok) {
  setDiscoveryError(data.error + (data.detail ? ': ' + data.detail : ''))
  return
}
setDiscoveredTools(data.tools) // [{ name, description }]
```

Use `fetch` only. No new libraries. Handle network errors with try/catch and show
the exact error message in red. Never show fake tools. Never fall back to anything.

---

### Part C — Full-screen Interactive Graph Explorer

This is the most important feature for the demo. Build it as a new page:
`frontend/src/app/graph/page.tsx`

Also add a "View graph" link in the main nav header next to "Register a tool".

**What it shows:**
- Every registered tool on Stemma as a node
- Edges connecting extensions to their parents
- Split percentages on each edge
- Live — polls getAllTools() every 10 seconds, re-renders on new tools
- Clickable nodes — clicking navigates to /tool/[id]
- The whole graph, not just one chain — base tools at the bottom, all extensions
  branching upward, showing the full tree of everything registered on chain

**Implementation using D3 (same import as GraphCanvas.tsx):**

Layout algorithm:
1. Call `getAllTools()` to get every tool
2. Build a tree structure: find all base tools (hasParent === false) as roots
3. For each base tool, recursively find all tools where parentId === this tool's id
4. Use D3 tree layout (`d3.tree()`) with the full dataset — not manual positioning
5. Render the tree top-down: base tools at top, extensions branching downward
   (or bottom-up if it looks better — use your judgment)

Node style (same as GraphCanvas spec):
- Rect: 180px × 52px, rx=4, fill=var(--surface), stroke=var(--border)
- Highlighted (currently hovered): stroke=var(--accent), strokeWidth=2
- Top line: tool name, 13px Inter
- Bottom line: #ID · X.XXXX MON/call, 11px mono, muted
- Clickable: router.push('/tool/' + id)

Edge style:
- Curved path (d3.linkVertical), stroke=var(--split-line), strokeWidth=1.5
- Label centered on edge: "N% ↑", 11px mono, muted

Live call animation:
- Poll getLogs for CallRecorded events every 5 seconds
- On new event: animate a dot (r=5, fill=var(--accent)) along the edge from
  the called tool up to its root, 400ms per edge, sequential
- Multiple simultaneous animations are fine

Container:
- Full viewport width and height minus the header
- SVG fills the container
- Pan and zoom via d3.zoom() — users should be able to zoom in/out and pan
- Show "N tools registered" count top-left in muted mono text
- Show "● LIVE" badge top-right with pulse animation

Empty state (no tools registered yet):
- Centered text: "No tools registered yet."
- CTA button: "Register the first tool →" linking to /extend

This page must be lazy-loaded: `dynamic(() => import('./GraphPage'), { ssr: false })`
Create the actual component in a separate file `frontend/src/app/graph/GraphPage.tsx`
and export it as default. The page.tsx just dynamic-imports it.

---

### Part D — Deploy Frontend to Railway

The frontend must be deployed to Railway, not just running locally.

```bash
cd frontend

# Create railway.json for static config
echo '{"build":{"builder":"NIXPACKS"},"deploy":{"startCommand":"npx next start","healthcheckPath":"/"}}' > railway.json

# Initialize Railway project for frontend
railway init  # select "Empty project", name it "stemma-frontend"

# Set environment variables
railway variables set NEXT_PUBLIC_CHAIN_ID=10143
railway variables set NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
railway variables set NEXT_PUBLIC_CONTRACT_ADDRESS=0x17d467d7C58a167637Ce2716BF457C4cDa29F382
railway variables set NEXT_PUBLIC_APP_URL=https://stemma-frontend-production.up.railway.app

# Deploy
railway up
```

Railway will give a URL like `https://stemma-frontend-production.up.railway.app`.

After deploy:
1. Verify the URL loads the marketplace
2. Write the Railway URL to `frontend/.env.local` as `NEXT_PUBLIC_APP_URL`
3. Update README.md with the real live URL

---

### Phase 2.5 checkpoint — do not continue until ALL of these are true:
- [ ] `/discover` endpoint returns real tools for a real MCP URL
- [ ] Frontend discovery input calls it and shows real tool cards
- [ ] Clicking a tool card pre-fills the registration form
- [ ] Submitting registers it on chain via MetaMask
- [ ] /graph page loads with D3 tree of all registered tools
- [ ] /graph nodes are clickable and navigate to /tool/[id]
- [ ] /graph polls for new tools and updates live
- [ ] /graph shows live call animation dots on CallRecorded events
- [ ] Frontend deployed to Railway with a live HTTPS URL
- [ ] Railway frontend URL added to README

Commit: `git commit -m "feat(frontend): discovery, graph explorer, Railway deploy"`

---

## Phase 4 — End-to-End Test

Do this manually. Every step must produce a real on-chain transaction.

1. Open the Railway frontend URL (not localhost)
2. Connect MetaMask (Monad Testnet)
3. Go to /extend — paste `https://stemma-mcp-server-production.up.railway.app/mcp`
   into the discovery input, click Discover
4. Select `summarize_text` from the discovered tools
5. Set price 0.001 MON, submit — confirm in MetaMask → this is Tool #0
6. Repeat for `summarize_text_pro` as an extension of Tool #0, 25% split, 0.0015 MON → Tool #1
7. Go to /graph — verify both tools appear as nodes with edge between them
8. Go to /tool/1 — deposit 0.05 MON
9. Verify callerBalances increased on testnet.monadexplorer.com
10. Go to /dashboard — verify earnings show for both tools
11. Click Withdraw — verify MON arrives in wallet

If any step fails, fix it before Phase 5.

---

## Phase 5 — Polish + README

Update README.md with real values:
- Live app URL: Railway frontend URL
- Contract: 0x17d467d7C58a167637Ce2716BF457C4cDa29F382
- MCP server: https://stemma-mcp-server-production.up.railway.app
- Claude Desktop config with real Railway MCP URL
- Local setup instructions

Final checklist before submit:
```
[ ] forge test — all 9 tests green
[ ] Contract address in README, page footer, explorer link
[ ] Live Railway frontend URL works and loads tool list from chain
[ ] /graph renders full tree with real on-chain data
[ ] /graph live dot animation fires on CallRecorded events
[ ] /extend discovery flow works end to end
[ ] /extend form registers both base and extension tools
[ ] Deposit widget sends correct MON
[ ] Dashboard shows earnings + upstream earnings
[ ] Withdraw works
[ ] MCP server live on Railway, discoverable via /discover
[ ] End-to-end tx on explorer: recordCall with 2x SplitPaid events
[ ] README complete with real URLs
[ ] GitHub repo public, clean commit history
[ ] No hardcoded fake data anywhere
[ ] All error states handled
[ ] Mobile layout not broken
```

---

## Commit Convention
```
init:            repo setup
feat(contracts): contract work
feat(frontend):  frontend work
feat(mcp):       mcp server work
fix:             bug fixes
docs:            readme / comments
deploy:          deployment commits
```

---

## If You Get Stuck

- next.config.ts webpack alias block must stay — it stubs out Coinbase/x402 deps that RainbowKit pulls in
- D3 SSR crash: wrap any D3 page with `dynamic(() => import(...), { ssr: false })`
- Railway deploy fails: check `railway variables` has all env vars set
- MCP server not found by Claude Desktop: restart Claude Desktop after config change
- RPC rate limited: add 1s delay between reads
- wagmi hooks error: confirm WagmiProvider wraps entire app in layout.tsx

---

*Stemma. Every author in the stack gets paid.*