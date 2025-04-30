import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIToMCPConverter } from '../openapi/parser.js';
import { HttpClient, HttpClientError } from '../client/http-client.js';
// import this class, extend and return server
export class MCPProxy {
    constructor(name, openApiSpec) {
        // // console.log(`[MCP Server Log] MCPProxy constructor started for server: ${name}`);
        this.server = new Server({ name, version: '1.0.0' }, { capabilities: { tools: {} } });
        // // console.log('[MCP Server Log] MCP Server instance created.');
        const baseUrl = openApiSpec.servers?.[0].url;
        if (!baseUrl) {
            console.error('[MCP Server Log] Error: No base URL found in OpenAPI spec');
            throw new Error('No base URL found in OpenAPI spec');
        }
        // // console.log(`[MCP Server Log] Base URL from spec: ${baseUrl}`);
        const apiKey = process.env.LUNARCRUSH_API_KEY;
        // // console.log(`[MCP Server Log] API Key found in env: ${apiKey ? 'Yes' : 'No'}`);
        const headersFromEnv = this.parseHeadersFromEnv();
        // // console.log(`[MCP Server Log] Parsed headers from env: ${JSON.stringify(headersFromEnv)}`);
        // // console.log('[MCP Server Log] Creating HttpClient...');
        this.httpClient = new HttpClient({
            baseUrl,
            headers: headersFromEnv,
            apiKey: apiKey,
        }, openApiSpec);
        // // console.log('[MCP Server Log] HttpClient created.');
        // // console.log('[MCP Server Log] Converting OpenAPI spec to MCP tools...');
        const converter = new OpenAPIToMCPConverter(openApiSpec);
        const { tools, openApiLookup } = converter.convertToMCPTools();
        this.tools = tools;
        this.openApiLookup = openApiLookup;
        // // console.log(`[MCP Server Log] OpenAPI conversion complete. Found ${Object.keys(this.openApiLookup).length} tools.`);
        // // console.log('[MCP Server Log] Setting up MCP request handlers...');
        this.setupHandlers();
        // // console.log('[MCP Server Log] MCP request handlers set up.');
        // // console.log('[MCP Server Log] MCPProxy constructor finished.');
    }
    setupHandlers() {
        // // console.log('[MCP Server Log] Setting up tools/list handler.');
        // Handle tool listing
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            // // console.log('[MCP Server Log] Received tools/list request.');
            const toolList = [];
            // Add methods as separate tools to match the MCP format
            Object.entries(this.tools).forEach(([toolName, def]) => {
                def.methods.forEach(method => {
                    const toolNameWithMethod = `${toolName}-${method.name}`;
                    const truncatedToolName = this.truncateToolName(toolNameWithMethod);
                    toolList.push({
                        name: truncatedToolName,
                        description: method.description,
                        inputSchema: method.inputSchema,
                    });
                });
            });
            // // console.log(`[MCP Server Log] Responding to tools/list with ${toolList.length} tools.`);
            return { tools: toolList };
        });
        // // console.log('[MCP Server Log] Setting up tools/call handler.');
        // Handle tool calling
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            // // console.log(`[MCP Server Log] Received tools/call request: ${JSON.stringify(request.params)}`);
            const { name, arguments: params } = request.params;
            // Find the operation in OpenAPI spec
            const operation = this.findOperation(name);
            if (!operation) {
                // console.error(`[MCP Server Log] Error: Method ${name} not found in openApiLookup.`);
                throw new Error(`Method ${name} not found`);
            }
            // // console.log(`[MCP Server Log] Found operation for tool ${name}: ${operation.method.toUpperCase()} ${operation.path}`);
            try {
                // // console.log(`[MCP Server Log] Executing operation via HttpClient for tool ${name}...`);
                const response = await this.httpClient.executeOperation(operation, params);
                // // console.log(`[MCP Server Log] HttpClient execution complete for ${name}. Status: ${response.status}`);
                // Convert response to MCP format
                const mcpResponse = {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response.data),
                        },
                    ],
                };
                // // console.log(`[MCP Server Log] Sending successful tools/call response for ${name}.`);
                return mcpResponse;
            }
            catch (error) {
                console.error(`[MCP Server Log] Error during tools/call execution for ${name}:`, error);
                if (error instanceof HttpClientError) {
                    // console.error(`[MCP Server Log] HttpClientError details - Status: ${error.status}, Data: ${JSON.stringify(error.data)}`);
                    const data = error.data; // Use error.data directly, it might not always have response
                    const errorResponse = {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'error',
                                    code: error.status,
                                    message: error.message,
                                    details: (typeof data === 'object' ? data : { data: data }),
                                }),
                            },
                        ],
                    };
                    // // console.log(`[MCP Server Log] Sending error tools/call response for ${name}.`);
                    return errorResponse;
                }
                // console.error(`[MCP Server Log] Rethrowing non-HttpClientError for ${name}.`);
                throw error;
            }
        });
        // // console.log('[MCP Server Log] setupHandlers finished.');
    }
    findOperation(operationId) {
        return this.openApiLookup[operationId] ?? null;
    }
    parseHeadersFromEnv() {
        const headersJson = process.env.OPENAPI_MCP_HEADERS;
        if (!headersJson) {
            return {};
        }
        try {
            // Keep warnings for env var issues on stderr
            const headers = JSON.parse(headersJson);
            if (typeof headers !== 'object' || headers === null) {
                console.warn('OPENAPI_MCP_HEADERS environment variable must be a JSON object, got:', typeof headers);
                return {};
            }
            return headers;
        }
        catch (error) {
            console.warn('Failed to parse OPENAPI_MCP_HEADERS environment variable:', error);
            return {};
        }
    }
    getContentType(headers) {
        const contentType = headers.get('content-type');
        if (!contentType)
            return 'binary';
        if (contentType.includes('text') || contentType.includes('json')) {
            return 'text';
        }
        else if (contentType.includes('image')) {
            return 'image';
        }
        return 'binary';
    }
    truncateToolName(name) {
        if (name.length <= 64) {
            return name;
        }
        return name.slice(0, 64);
    }
    async connect(transport) {
        // The SDK will handle stdio communication
        await this.server.connect(transport);
    }
    getServer() {
        return this.server;
    }
}
//# sourceMappingURL=proxy.js.map