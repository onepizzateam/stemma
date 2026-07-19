import Link from 'next/link'
import type { Tool } from '@/lib/contract'
import { formatMON } from '@/lib/graph'
export default function ToolRow({ tool, id }: { tool: Tool; id: number }) { return <tr><td className="mono">#{id}</td><td><Link className="link" href={`/tool/${id}`}>{tool.name}</Link></td><td>{tool.hasParent ? <Link className="link" href={`/tool/${tool.parentId}`}>#{tool.parentId.toString()}</Link> : <span className="muted">base</span>}</td><td className="mono">{tool.hasParent ? `${Number(tool.upstreamSplitBps)/100}%` : '-'}</td><td>{tool.totalCalls.toString()}</td><td className="mon-amount">{formatMON(tool.pricePerCall)} MON</td></tr> }
