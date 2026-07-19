'use client'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useChainId, useSwitchChain } from 'wagmi'
import { monadTestnet } from '@/lib/monad'
export default function WalletConnect() { const chainId = useChainId(); const { switchChain } = useSwitchChain(); return <>{chainId && chainId !== 10143 ? <div className="notice" style={{position:'fixed',top:0,left:0,right:0,zIndex:10}}><div className="container" style={{display:'flex',alignItems:'center',gap:12}}><span>You&apos;re on the wrong network.</span><button className="btn btn-secondary" onClick={() => switchChain({chainId: monadTestnet.id})}>Switch to Monad Testnet</button></div></div> : null}<ConnectButton chainStatus="icon" showBalance={false} /></> }
