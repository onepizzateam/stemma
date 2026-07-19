'use client'

import { parseAbiItem } from 'viem'
import { useEffect, useState } from 'react'
import { publicClient, STEMMA_ADDRESS, readWithRetry, type Tool } from '@/lib/contract'
import { formatMON, shortAddress } from '@/lib/graph'

type Item = { toolId: bigint; caller: string; fee: bigint; at: number }
const callRecorded = parseAbiItem('event CallRecorded(uint256 indexed toolId, address indexed caller, uint256 totalFee, uint256 depth)')

export default function LiveFeed({ tools }: { tools: Tool[] }) {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const logs = await readWithRetry(() => publicClient.getLogs({ address: STEMMA_ADDRESS, event: callRecorded, fromBlock: 'earliest' }))
        if (active) setItems(logs.slice(-5).reverse().map((log) => ({ toolId: log.args.toolId ?? 0n, caller: log.args.caller ?? '', fee: log.args.totalFee ?? 0n, at: Date.now() })))
      } catch { }
    }
    void load()
    const timer = setInterval(load, 8000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  return <div className="feed"><div className="container feed-inner">{items.length ? items.map((item) => <span key={`${item.toolId}-${item.at}`}><span className="live"><i className="live-dot" />LIVE</span> {tools[Number(item.toolId)]?.name ?? `Tool #${item.toolId}`} · {shortAddress(item.caller)} · {formatMON(item.fee)} MON · {Math.max(0, Math.floor((Date.now() - item.at) / 1000))}s ago</span>) : <span>No calls recorded yet. The feed will update on-chain.</span>}</div></div>
}
