import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import 'dotenv/config'
const monadTestnet={id:10143,name:'Monad Testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:['https://testnet-rpc.monad.xyz']}}} as const
const STEMMA_ADDRESS=process.env.CONTRACT_ADDRESS as `0x${string}`
const ABI=parseAbi(['function callerBalances(address) view returns (uint256)','function getTool(uint256) view returns ((address author, string name, string description, string endpoint, uint256 pricePerCall, bool hasParent, uint256 parentId, uint256 upstreamSplitBps, uint256 totalCalls, uint256 totalEarned, bool active))','function recordCall(uint256 toolId, address caller) external'])
const publicClient=createPublicClient({chain:monadTestnet,transport:http()})
const privateKey=process.env.SERVER_PRIVATE_KEY as `0x${string}`
const account=privateKeyToAccount(privateKey)
const walletClient=createWalletClient({account,chain:monadTestnet,transport:http()})
export async function checkBalance(caller:string,toolId:bigint):Promise<boolean>{const [balance,tool]=await Promise.all([publicClient.readContract({address:STEMMA_ADDRESS,abi:ABI,functionName:'callerBalances',args:[caller as `0x${string}`]}),publicClient.readContract({address:STEMMA_ADDRESS,abi:ABI,functionName:'getTool',args:[toolId]})]);return (balance as bigint)>=(tool as {pricePerCall:bigint}).pricePerCall}
export async function recordCall(toolId:bigint,caller:string):Promise<string>{return walletClient.writeContract({address:STEMMA_ADDRESS,abi:ABI,functionName:'recordCall',args:[toolId,caller as `0x${string}`]})}
