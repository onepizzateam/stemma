import './globals.css'
import Providers from './providers'
import WalletConnect from '@/components/WalletConnect'
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Providers><header className="container" style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:18,paddingBottom:18,borderBottom:'1px solid var(--border)'}}><a href="/" style={{fontWeight:600,textDecoration:'none',color:'inherit',fontSize:18}}>Stemma</a><WalletConnect /></header>{children}</Providers></body></html> }
