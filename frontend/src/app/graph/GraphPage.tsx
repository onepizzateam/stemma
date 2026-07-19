// @ts-nocheck
'use client'

import * as d3 from 'd3'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseAbiItem } from 'viem'
import { publicClient, readWithRetry, STEMMA_ABI, STEMMA_ADDRESS, type Tool } from '@/lib/contract'
import { formatMON } from '@/lib/graph'

interface GraphNode {
  id: number
  tool?: Tool
  children?: GraphNode[]
}

const callRecordedEvent = parseAbiItem('event CallRecorded(uint256 indexed toolId, address indexed caller, uint256 totalFee, uint256 depth)')

export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null)
  const fromBlock = useRef<bigint | null>(null)
  const toolsRef = useRef<Tool[]>([])
  const router = useRouter()
  const [tools, setTools] = useState<Tool[]>([])
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await readWithRetry(() =>
          publicClient.readContract({ address: STEMMA_ADDRESS, abi: STEMMA_ABI, functionName: 'getAllTools' })
        ) as Tool[]
        if (!cancelled) { toolsRef.current = next; setTools(next) }
      } catch { if (!cancelled) setTools([]) }
    }
    void load()
    const timer = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!svgRef.current || tools.length === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = svgRef.current.clientWidth || window.innerWidth
    const height = svgRef.current.clientHeight || window.innerHeight - 70

    const byParent = new Map<number, number[]>()
    tools.forEach((tool, id) => {
      if (tool.hasParent) {
        const pid = Number(tool.parentId)
        byParent.set(pid, [...(byParent.get(pid) ?? []), id])
      }
    })

    function buildNode(id: number): GraphNode {
      return {
        id,
        tool: tools[id],
        children: (byParent.get(id) ?? []).map(buildNode),
      }
    }

    const rootData: GraphNode = {
      id: -1,
      children: tools
        .map((t, i) => ({ id: i, tool: t }))
        .filter(n => !n.tool.hasParent)
        .map(n => buildNode(n.id)),
    }

    const root = d3.hierarchy<GraphNode>(rootData, d => d.children ?? null)
    const tree = d3.tree<GraphNode>().nodeSize([220, 110])
    tree(root)

    const nodes = root.descendants().filter(n => n.data.id >= 0) as d3.HierarchyPointNode<GraphNode>[]
    const links = root.links().filter(l => l.target.data.id >= 0 && l.source.data.id >= 0)

    const xMin = d3.min(nodes, n => n.x) ?? 0
    const xMax = d3.max(nodes, n => n.x) ?? width
    const contentWidth = Math.max(width, xMax - xMin + 260)
    const contentHeight = Math.max(height, (d3.max(nodes, n => n.y) ?? 0) + 160)

    svg.attr('viewBox', `0 0 ${contentWidth} ${contentHeight}`)
    const zoomLayer = svg.append('g').attr('transform', `translate(${contentWidth / 2 - (xMin + xMax) / 2},40)`)
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.35, 2.5]).on('zoom', event => zoomLayer.attr('transform', event.transform)))

    zoomLayer.selectAll('path.graph-edge')
      .data(links)
      .join('path')
      .attr('class', 'graph-edge')
      .attr('data-from', l => l.target.data.id)
      .attr('d', d3.linkVertical<d3.HierarchyPointLink<GraphNode>, d3.HierarchyPointNode<GraphNode>>()
        .x(n => n.x).y(n => n.y))
      .attr('fill', 'none')
      .attr('stroke', 'var(--split-line)')
      .attr('stroke-width', 1.5)

    zoomLayer.selectAll('text.edge-label')
      .data(links)
      .join('text')
      .attr('class', 'edge-label')
      .attr('x', l => (l.source.x + l.target.x) / 2)
      .attr('y', l => (l.source.y + l.target.y) / 2 - 6)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'monospace')
      .attr('font-size', 11)
      .attr('fill', 'var(--muted)')
      .text(l => `${(Number(l.target.data.tool?.upstreamSplitBps ?? 0n) / 100).toFixed(0)}% ↑`)

    const groups = zoomLayer.selectAll('g.graph-node')
      .data(nodes, n => n.data.id)
      .join('g')
      .attr('class', 'graph-node')
      .attr('transform', n => `translate(${n.x - 90},${n.y})`)
      .style('cursor', 'pointer')
      .on('mouseenter', (_, n) => setHovered(n.data.id))
      .on('mouseleave', () => setHovered(null))
      .on('click', (_, n) => router.push(`/tool/${n.data.id}`))

    groups.append('rect')
      .attr('width', 180).attr('height', 52).attr('rx', 4)
      .attr('fill', 'var(--surface)')
      .attr('stroke', n => n.data.id === hovered ? 'var(--accent)' : 'var(--border)')
      .attr('stroke-width', n => n.data.id === hovered ? 2 : 1)

    groups.append('text')
      .attr('x', 12).attr('y', 20).attr('font-size', 13)
      .text(n => n.data.tool?.name ?? `Tool #${n.data.id}`)

    groups.append('text')
      .attr('x', 12).attr('y', 39)
      .attr('font-family', 'monospace').attr('font-size', 11)
      .attr('fill', 'var(--muted)')
      .text(n => `#${n.data.id} · ${formatMON(n.data.tool?.pricePerCall ?? 0n)} MON/call`)

  }, [tools, hovered, router])

  useEffect(() => {
    let stopped = false
    const poll = async () => {
      try {
        const latest = await publicClient.getBlockNumber()
        if (fromBlock.current === null) { fromBlock.current = latest; return }
        const logs = await publicClient.getLogs({
          address: STEMMA_ADDRESS,
          event: callRecordedEvent,
          fromBlock: fromBlock.current + 1n,
          toBlock: latest,
        })
        fromBlock.current = latest
        for (const log of logs) {
          if (stopped) return
          let current = Number(log.args.toolId ?? 0n)
          while (toolsRef.current[current]?.hasParent) {
            const path = document.querySelector(`path.graph-edge[data-from="${current}"]`) as SVGPathElement | null
            if (path) await animateDot(path)
            current = Number(toolsRef.current[current].parentId)
          }
        }
      } catch { /* retried next poll */ }
    }
    void poll()
    const timer = setInterval(poll, 5000)
    return () => { stopped = true; clearInterval(timer) }
  }, [])

  if (tools.length === 0) return (
    <main className="graph-page empty-state">
      <p>No tools registered yet.</p>
      <Link className="btn btn-primary" href="/extend">Register the first tool →</Link>
    </main>
  )

  return (
    <main className="graph-page">
      <div className="graph-count mono">{tools.length} tools registered</div>
      <div className="graph-live mono"><span className="live-dot" /> LIVE</div>
      <svg ref={svgRef} aria-label="Stemma tool graph" />
    </main>
  )
}

function animateDot(path: SVGPathElement) {
  return new Promise<void>(resolve => {
    const length = path.getTotalLength()
    const dot = d3.select(path.ownerSVGElement).append('circle').attr('r', 5).attr('fill', 'var(--accent)')
    dot.transition().duration(400)
      .attrTween('cx', () => t => String(path.getPointAtLength(length * t).x))
      .attrTween('cy', () => t => String(path.getPointAtLength(length * t).y))
      .on('end', () => { dot.remove(); resolve() })
  })
}