import { MCPProxy } from './openapi-mcp-server/mcp/proxy.js';
export declare class ValidationError extends Error {
    errors: any[];
    constructor(errors: any[]);
}
export declare function initProxy(specPath: string, baseUrl: string | undefined): Promise<MCPProxy>;
//# sourceMappingURL=init-server.d.ts.map