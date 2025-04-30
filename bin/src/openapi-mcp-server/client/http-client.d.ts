import type { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
export type HttpClientConfig = {
    baseUrl: string;
    headers?: Record<string, string>;
    apiKey?: string;
};
export type HttpClientResponse<T = any> = {
    data: T;
    status: number;
    headers: Headers;
};
export declare class HttpClientError extends Error {
    status: number;
    data: any;
    headers?: Headers | undefined;
    constructor(message: string, status: number, data: any, headers?: Headers | undefined);
}
export declare class HttpClient {
    private api;
    private client;
    private apiKey;
    private lastRequestTime;
    private requestIntervalMs;
    constructor(config: HttpClientConfig, openApiSpec: OpenAPIV3.Document | OpenAPIV3_1.Document);
    private prepareFileUpload;
    private handleRateLimit;
    /**
     * Execute an OpenAPI operation
     */
    executeOperation<T = any>(operation: OpenAPIV3.OperationObject & {
        method: string;
        path: string;
    }, inputParams?: Record<string, any>): Promise<HttpClientResponse<T>>;
    private resolveRequestBody;
    private generateOperationIdFallback;
}
//# sourceMappingURL=http-client.d.ts.map