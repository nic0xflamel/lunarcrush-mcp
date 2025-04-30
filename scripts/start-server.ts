// import dotenv from 'dotenv';
// dotenv.config(); // Removed redundant dotenv loading

import path from 'node:path'
import { fileURLToPath } from 'url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { initProxy, ValidationError } from '../src/init-server.js'

// // console.log('[MCP Server Log] start-server.ts script started.'); // Removed log

// Function to parse simple key-value arguments
function parseArgs(args: string[]): Record<string, string> {
  const parsedArgs: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      // Check if next arg exists and doesn't start with '--'
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsedArgs[key] = args[i + 1];
        i++; // Skip the value argument
      } else {
        // Treat as a boolean flag if no value follows
        parsedArgs[key] = "true";
      }
    }
  }
  return parsedArgs;
}

export async function startServer(args: string[] = process.argv.slice(2)) {
  // // console.log('[MCP Server Log] startServer function entered.'); // Removed log
  const filename = fileURLToPath(import.meta.url)
  const directory = path.dirname(filename)
  const specPath = path.resolve(directory, '../../specs/lunarcrush_openapi_v3.json')
  // // console.log(`[MCP Server Log] Calculated specPath: ${specPath}`); // Removed log
  
  // Remove baseUrl parsing and reading logic
  // const cliArgs = parseArgs(args);
  // const baseUrl = cliArgs['base-url'] ?? process.env.BASE_URL ?? undefined
  // // console.log(`[MCP Server Log] Determined baseUrl: ${baseUrl ?? 'undefined'}`); // Removed log

  try {
    // // console.log('[MCP Server Log] Initializing MCPProxy...'); // Removed log
    // Remove baseUrl from the initProxy call
    const proxy = await initProxy(specPath)
    // // console.log('[MCP Server Log] MCPProxy initialized successfully.'); // Removed log
    // // console.log('[MCP Server Log] Connecting transport...'); // Removed log
    await proxy.connect(new StdioServerTransport())
    // // console.log('[MCP Server Log] Transport connected.'); // Removed log

    return proxy.getServer()
  } catch (initError) {
      console.error('[MCP Server Log] Fatal error during server initialization:', initError);
      process.exit(1);
  }
}

startServer().catch(error => {
  if (error instanceof ValidationError) {
    console.error('Invalid OpenAPI 3.1 specification:')
    error.errors.forEach(err => console.error(err))
  } else {
    console.error('Error during server execution (after init):', error)
  }
  process.exit(1)
})
