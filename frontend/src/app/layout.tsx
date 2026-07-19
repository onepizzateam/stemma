import './globals.css'
import './extra.css'
import Providers from './providers'
import WalletConnect from '@/components/WalletConnect'
import Link from 'next/link'
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Providers><header className="container site-header"><a href="/" className="brand">Stemma</a><nav><Link href="/extend">Register a tool</Link><Link href="/graph">View graph</Link><Link href="/dashboard">Earnings</Link></nav><WalletConnect /></header>{children}</Providers></body></html> }
