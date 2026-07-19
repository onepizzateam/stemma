'use client'

import { useEffect, useState } from 'react'
import { parseEther } from 'viem'
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { publicClient, readWithRetry, STEMMA_ABI, STEMMA_ADDRESS, type Tool } from '@/lib/contract'
import { errorMessage, formatMON } from '@/lib/graph'

export default function ExtendPage() {
  const { address } = useAccount()
  const chainId = useChainId()
  const { writeContract, data: hash, error: writeError, isPending } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash })
  const [mode, setMode] = useState<'base' | 'extension'>('base')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [price, setPrice] = useState('0.001')
  const [parentId, setParentId] = useState('0')
  const [split, setSplit] = useState('25')
  const [parent, setParent] = useState<Tool | null>(null)

  useEffect(() => {
    if (mode !== 'extension') return
    void readWithRetry(() => publicClient.readContract({ address: STEMMA_ADDRESS, abi: STEMMA_ABI, functionName: 'getTool', args: [BigInt(parentId)] }))
      .then((tool) => setParent(tool as Tool))
      .catch(() => setParent(null))
  }, [mode, parentId])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!address || chainId !== 10143 || !endpoint.startsWith('https://')) return
    if (mode === 'base') {
      writeContract({ address: STEMMA_ADDRESS, abi: STEMMA_ABI, functionName: 'registerTool', args: [name, description, endpoint, parseEther(price)] })
    } else {
      writeContract({ address: STEMMA_ADDRESS, abi: STEMMA_ABI, functionName: 'registerExtension', args: [name, description, endpoint, parseEther(price), BigInt(parentId), BigInt(split)] })
    }
  }

  return <main className="container page"><form className="form stack" onSubmit={submit}>
    <h1>Register a tool</h1>
    <div style={{ display: 'flex', gap: 20 }}>
      <label><input type="radio" checked={mode === 'base'} onChange={() => setMode('base')} style={{ width: 'auto' }} /> New base tool</label>
      <label><input type="radio" checked={mode === 'extension'} onChange={() => setMode('extension')} style={{ width: 'auto' }} /> Extension of existing tool</label>
    </div>
    <div className="field"><label>Tool name</label><input required value={name} onChange={(event) => setName(event.target.value)} /></div>
    <div className="field"><label>Description <span className="muted">{description.length}/140</span></label><textarea required maxLength={140} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <div className="field"><label>MCP server endpoint</label><input required type="url" placeholder="https://" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></div>
    <div className="field"><label>Price per call (MON)</label><input required min="0.000000000000000001" step="any" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /><span className="muted">Approx. ${(Number(price) * 2.5).toFixed(2)} USD</span></div>
    {mode === 'extension' && <>
      <div className="field"><label>Parent tool ID</label><input required min="0" type="number" value={parentId} onChange={(event) => setParentId(event.target.value)} />{parent && <span className="muted">{parent.name} by {parent.author.slice(0, 8)}... at {formatMON(parent.pricePerCall)} MON</span>}</div>
      <div className="field"><label>Upstream split: {split}%</label><input type="range" min="1" max="60" value={split} onChange={(event) => setSplit(event.target.value)} /><input type="number" min="1" max="60" value={split} onChange={(event) => setSplit(event.target.value)} /></div>
      <div className="card mono">Your price per call: {Number(price).toFixed(4)} MON<br />- upstream split ({split}%): -{(Number(price) * Number(split) / 100).toFixed(4)} MON<br />- platform fee (2%): -{(Number(price) * .02).toFixed(4)} MON<hr style={{ margin: '12px 0', border: 0, borderTop: '1px solid var(--border)' }} />You receive per call: {(Number(price) * (1 - Number(split) / 100 - .02)).toFixed(4)} MON</div>
    </>}
    {!address ? <p className="muted">Connect wallet to register a tool.</p> : <button className="btn btn-primary" disabled={isPending || chainId !== 10143}>{isPending ? 'Confirming on Monad...' : 'Register on Monad'}</button>}
    {writeError && <p className="error">{errorMessage(writeError)}</p>}
    {receipt.isSuccess && <div className="card success">Transaction confirmed on Monad. {hash && <a className="link" href={`https://testnet.monadexplorer.com/tx/${hash}`} target="_blank">View transaction</a>}</div>}
  </form></main>
}
