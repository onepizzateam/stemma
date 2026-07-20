import { createPublicClient, http, parseAbi } from 'viem'
import { monadTestnet } from './monad'

export const STEMMA_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`
export const STEMMA_ABI = parseAbi([
  'function getAllTools() view returns ((address author, string name, string description, string endpoint, uint256 pricePerCall, bool hasParent, uint256 parentId, uint256 upstreamSplitBps, uint256 totalCalls, uint256 totalEarned, bool active)[])',
  'function toolCount() view returns (uint256)',
  'function getTool(uint256) view returns ((address author, string name, string description, string endpoint, uint256 pricePerCall, bool hasParent, uint256 parentId, uint256 upstreamSplitBps, uint256 totalCalls, uint256 totalEarned, bool active))',
  'function getAncestorChain(uint256) view returns (uint256[] ids, address[] authors, uint256[] splits)',
  'function callerBalances(address) view returns (uint256)', 'function pendingWithdrawals(address) view returns (uint256)',
  'function registerTool(string name, string description, string endpoint, uint256 pricePerCall) returns (uint256)',
  'function registerExtension(string name, string description, string endpoint, uint256 pricePerCall, uint256 parentId, uint256 upstreamSplitBps) returns (uint256)',
  'function deposit() payable', 'function withdraw()', 'event CallRecorded(uint256 indexed toolId, address indexed caller, uint256 totalFee, uint256 depth)',
  'event SplitPaid(uint256 indexed toolId, address indexed recipient, uint256 amount)',
])
export const publicClient = createPublicClient({ chain: monadTestnet, transport: http() })
export type Tool = { author: `0x${string}`; name: string; description: string; endpoint: string; pricePerCall: bigint; hasParent: boolean; parentId: bigint; upstreamSplitBps: bigint; totalCalls: bigint; totalEarned: bigint; active: boolean }
export async function readWithRetry<T>(read: () => Promise<T>, attempts = 3): Promise<T> { let error: unknown; for (let i = 0; i < attempts; i++) { try { return await read() } catch (e) { error = e; if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1000)) } } throw error }
