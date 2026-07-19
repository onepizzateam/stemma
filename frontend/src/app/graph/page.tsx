'use client'

import dynamic from 'next/dynamic'

const GraphPage = dynamic(() => import('./GraphPage'), { ssr: false })
export default function Page() { return <GraphPage /> }
