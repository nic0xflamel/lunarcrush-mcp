import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { OpenAPIV3 } from 'openapi-types';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
export declare class MCPProxy {
    private server;
    private httpClient;
    private tools;
    private openApiLookup;
    constructor(name: string, openApiSpec: OpenAPIV3.Document);
    private setupHandlers;
    private findOperation;
    private parseHeadersFromEnv;
    private getContentType;
    private truncateToolName;
    connect(transport: Transport): Promise<void>;
    getServer(): Server<{
        method: string;
        params?: {
            [x: string]: unknown;
            _meta?: {
                [x: string]: unknown;
                progressToken?: string | number | undefined;
            } | undefined;
        } | undefined;
    }, {
        method: string;
        params?: {
            [x: string]: unknown;
            _meta?: {
                [x: string]: unknown;
            } | undefined;
        } | undefined;
    }, {
        [x: string]: unknown;
        _meta?: {
            [x: string]: unknown;
        } | undefined;
    }>;
}
//# sourceMappingURL=proxy.d.ts.map