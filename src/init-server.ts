import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { OpenAPIV3 } from 'openapi-types'
import OpenAPISchemaValidator from 'openapi-schema-validator'

import { MCPProxy } from './openapi-mcp-server/mcp/proxy.js'

// console.log('[MCP Server Log] init-server.ts module loaded.');

export class ValidationError extends Error {
  constructor(public errors: any[]) {
    super('OpenAPI validation failed')
    this.name = 'ValidationError'
  }
}

async function loadOpenApiSpec(specPath: string): Promise<OpenAPIV3.Document> {
  // console.log(`[MCP Server Log] loadOpenApiSpec called with path: ${specPath}`);
  let rawSpec: string

  try {
    // console.log(`[MCP Server Log] Attempting to read spec file at: ${specPath}`);
    rawSpec = fs.readFileSync(specPath, 'utf-8')
    // console.log('[MCP Server Log] Spec file read successfully.');
  } catch (error) {
    console.error(`[MCP Server Log] Failed to read OpenAPI specification file: ${(error as Error).message}`);
    console.error(`[MCP Server Log] Intended spec path was: ${specPath}`);
    process.exit(1)
  }

  // Parse and validate the OpenApi Spec
  try {
    console.log('[MCP Server Log] Parsing JSON spec...');
    const parsed = JSON.parse(rawSpec)
    console.log('[MCP Server Log] JSON parsed successfully.');

    console.log('[MCP Server Log] Spec loaded.');
    return parsed as OpenAPIV3.Document
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('[MCP Server Log] OpenAPI Validation Error:', error.errors);
      throw error
    }
    console.error('[MCP Server Log] Failed to parse OpenAPI spec JSON:', (error as Error).message)
    process.exit(1)
  }
}

export async function initProxy(specPath: string) {
  console.log('[MCP Server Log] initProxy called.');
  console.log('[MCP Server Log] Loading OpenAPI spec...');
  const openApiSpec = await loadOpenApiSpec(specPath)
  console.log('[MCP Server Log] OpenAPI spec loaded, creating MCPProxy instance...');
  const proxy = new MCPProxy('LunarCrush API', openApiSpec)
  console.log('[MCP Server Log] MCPProxy instance created.');

  return proxy
}
