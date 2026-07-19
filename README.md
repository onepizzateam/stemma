# Stemma — Composable MCP Extension Graph on Monad

## The Problem

Open source created the software internet and left its contributors unpaid. The same is happening to MCP: thousands of servers exist, almost none earn revenue, and the developers who extend and improve existing tools are invisible and uncompensated.

## The Solution

Stemma is an on-chain protocol where every MCP extension inherits economic rights from the tool it builds on. Every call through the stack automatically splits MON across every author in the graph. The split rules live on Monad: immutable, auditable, and fast to settle.

## Why Monad

Multi-party micropayment splits are economically broken on most EVM chains. Monad's parallel execution makes frequent, low-value split accounting practical for a composable tool graph.

## How It Works

1. Register a base tool or extend an existing one and declare an upstream split.
2. Agent operators deposit MON into Stemma.
3. An MCP server checks balance, serves the tool, and calls `recordCall()`.
4. Stemma walks the extension graph and splits MON to every author automatically.
5. Authors withdraw accumulated MON at any time.

## Live

- Live app: [https://frontend-production-0c8d.up.railway.app](https://frontend-production-0c8d.up.railway.app)
- MCP server: [https://stemma-mcp-server-production.up.railway.app](https://stemma-mcp-server-production.up.railway.app)
- MCP service health endpoint: https://stemma-mcp-server-production.up.railway.app/health
- Contract: `0x17d467d7C58a167637Ce2716BF457C4cDa29F382`
- Explorer: https://testnet.monadexplorer.com/address/0x17d467d7C58a167637Ce2716BF457C4cDa29F382

## Stack

- Solidity + Foundry on Monad testnet
- Next.js 15, TypeScript, wagmi, viem, RainbowKit, and D3
- MCP SDK and Railway

## Local Setup

```bash
# Contract
cd contracts
forge test

# Frontend
cd ../frontend
npm install
npm run dev

# MCP server
cd ../mcp-server
npm install
npm run dev
```

## Claude Desktop

```json
{
  "mcpServers": {
    "stemma": {
      "url": "https://stemma-mcp-server-production.up.railway.app/mcp"
    }
  }
}
```
