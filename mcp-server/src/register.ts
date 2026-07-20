import { createWalletClient, createPublicClient, http, parseAbi, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import 'dotenv/config'

const monadTestnet = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } } as const
const STEMMA_ADDRESS = process.env.CONTRACT_ADDRESS as `0x${string}`
const ABI = parseAbi(['function registerTool(string name, string description, string endpoint, uint256 pricePerCall) returns (uint256)', 'function toolCount() view returns (uint256)'])
const account = privateKeyToAccount(process.env.SERVER_PRIVATE_KEY as `0x${string}`)
const publicClient = createPublicClient({ chain: monadTestnet, transport: http() })
const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http() })

const ENDPOINT = 'https://stemma-mcp-server-production.up.railway.app/mcp'

const tools = [
  { name: 'word_count', description: 'Counts words, characters, and sentences in any text. 0.0005 MON/call (Tool #2 on Stemma).', price: parseEther('0.0005') },
  { name: 'extract_keywords', description: 'Extracts the top keywords from any text. 0.0008 MON/call (Tool #3 on Stemma).', price: parseEther('0.0008') },
  { name: 'bullet_points', description: 'Converts any text into a bullet point list. 0.0010 MON/call (Tool #4 on Stemma).', price: parseEther('0.001') },
]

async function main() {
  const count = await publicClient.readContract({ address: STEMMA_ADDRESS, abi: ABI, functionName: 'toolCount' })
  console.log(`Current tool count: ${count}`)
  for (const tool of tools) {
    console.log(`Registering ${tool.name}...`)
    const hash = await walletClient.writeContract({ address: STEMMA_ADDRESS, abi: ABI, functionName: 'registerTool', args: [tool.name, tool.description, ENDPOINT, tool.price] })
    console.log(`  tx: ${hash}`)
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  confirmed`)
  }
  const newCount = await publicClient.readContract({ address: STEMMA_ADDRESS, abi: ABI, functionName: 'toolCount' })
  console.log(`Done. Tool count now: ${newCount}`)
}

main().catch(console.error)