import fs from 'node:fs';
import { MCPProxy } from './openapi-mcp-server/mcp/proxy.js';
// console.log('[MCP Server Log] init-server.ts module loaded.');
export class ValidationError extends Error {
    constructor(errors) {
        super('OpenAPI validation failed');
        this.errors = errors;
        this.name = 'ValidationError';
    }
}
async function loadOpenApiSpec(specPath) {
    // console.log(`[MCP Server Log] loadOpenApiSpec called with path: ${specPath}`);
    let rawSpec;
    try {
        // console.log(`[MCP Server Log] Attempting to read spec file at: ${specPath}`);
        rawSpec = fs.readFileSync(specPath, 'utf-8');
        // console.log('[MCP Server Log] Spec file read successfully.');
    }
    catch (error) {
        console.error(`[MCP Server Log] Failed to read OpenAPI specification file: ${error.message}`);
        console.error(`[MCP Server Log] Intended spec path was: ${specPath}`);
        process.exit(1);
    }
    // Parse and validate the OpenApi Spec
    try {
        console.log('[MCP Server Log] Parsing JSON spec...');
        const parsed = JSON.parse(rawSpec);
        console.log('[MCP Server Log] JSON parsed successfully.');
        console.log('[MCP Server Log] Spec loaded.');
        return parsed;
    }
    catch (error) {
        if (error instanceof ValidationError) {
            console.error('[MCP Server Log] OpenAPI Validation Error:', error.errors);
            throw error;
        }
        console.error('[MCP Server Log] Failed to parse OpenAPI spec JSON:', error.message);
        process.exit(1);
    }
}
export async function initProxy(specPath) {
    console.log('[MCP Server Log] initProxy called.');
    console.log('[MCP Server Log] Loading OpenAPI spec...');
    const openApiSpec = await loadOpenApiSpec(specPath);
    console.log('[MCP Server Log] OpenAPI spec loaded, creating MCPProxy instance...');
    const proxy = new MCPProxy('LunarCrush API', openApiSpec);
    console.log('[MCP Server Log] MCPProxy instance created.');
    return proxy;
}
//# sourceMappingURL=init-server.js.map