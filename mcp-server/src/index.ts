import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { checkBalance, recordCall } from './registry.js'
import { extractSummary } from './tools/summarize.js'

const insufficientBalance = (toolId: number) => ({
  content: [{ type: 'text' as const, text: `Insufficient balance. Deposit MON at ${process.env.APP_URL ?? 'http://localhost:3000'}/tool/${toolId}` }],
  isError: true,
})

function createMcpServer() {
  const server = new Server({ name: 'stemma-demo', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'summarize_text', description: 'Summarizes any text into 2 sentences. Costs 0.0010 MON per call (Tool #0 on Stemma).', inputSchema: { type: 'object', properties: { text: { type: 'string' }, caller_address: { type: 'string' } }, required: ['text', 'caller_address'] } },
      { name: 'summarize_text_pro', description: 'Summarizes text with configurable sentence count. 0.0015 MON/call. Extends Tool #0 with 25% upstream split (Tool #1 on Stemma).', inputSchema: { type: 'object', properties: { text: { type: 'string' }, sentences: { type: 'number', default: 3 }, caller_address: { type: 'string' } }, required: ['text', 'caller_address'] } },
    ],
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments as Record<string, unknown> | undefined
    const caller = args?.caller_address
    if (typeof caller !== 'string') return { content: [{ type: 'text' as const, text: 'caller_address is required' }], isError: true }
    if (request.params.name === 'summarize_text') {
      if (!(await checkBalance(caller, 0n))) return insufficientBalance(0)
      await recordCall(0n, caller)
      return { content: [{ type: 'text' as const, text: extractSummary(String(args?.text ?? ''), 2) }] }
    }
    if (request.params.name === 'summarize_text_pro') {
      if (!(await checkBalance(caller, 1n))) return insufficientBalance(1)
      await recordCall(1n, caller)
      const count = typeof args?.sentences === 'number' ? args.sentences : 3
      return { content: [{ type: 'text' as const, text: extractSummary(String(args?.text ?? ''), count) }] }
    }
    throw new Error(`Unknown tool: ${request.params.name}`)
  })
  return server
}

const transports = new Map<string, StreamableHTTPServerTransport>()

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => { try { resolve(JSON.parse(body)) } catch (error) { reject(error) } })
    request.on('error', reject)
  })
}

const httpServer = createServer(async (request, response) => {
  if (request.url === '/' || request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ status: 'ok', service: 'stemma-mcp-server' }))
    return
  }
  if (request.url !== '/mcp') { response.writeHead(404); response.end(); return }
  try {
    if (request.method === 'POST') {
      const body = await readJson(request)
      const requestedSession = request.headers['mcp-session-id']
      const sessionId = Array.isArray(requestedSession) ? requestedSession[0] : requestedSession
      let transport = sessionId ? transports.get(sessionId) : undefined
      if (!transport && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessioninitialized: (id) => { transports.set(id, transport!) },
        })
        await createMcpServer().connect(transport)
      }
      if (!transport) {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Missing or invalid MCP session' }, id: null }))
        return
      }
      await transport.handleRequest(request, response, body)
      return
    }
    response.writeHead(405, { Allow: 'POST' })
    response.end('Method Not Allowed')
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: error instanceof Error ? error.message : 'Internal server error' }, id: null }))
    }
  }
})

httpServer.listen(3000, '0.0.0.0')
if (!process.env.RAILWAY_ENVIRONMENT) void createMcpServer().connect(new StdioServerTransport())
