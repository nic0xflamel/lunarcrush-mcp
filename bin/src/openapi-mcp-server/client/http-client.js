import OpenAPIClientAxios from 'openapi-client-axios';
import FormData from 'form-data';
import fs from 'fs';
import { isFileUploadParameter } from '../openapi/file-upload.js';
import { setTimeout } from 'timers/promises';
export class HttpClientError extends Error {
    constructor(message, status, data, headers) {
        super(`${status} ${message}`);
        this.status = status;
        this.data = data;
        this.headers = headers;
        this.name = 'HttpClientError';
    }
}
export class HttpClient {
    constructor(config, openApiSpec) {
        this.lastRequestTime = 0;
        this.requestIntervalMs = 1000;
        // console.log('[MCP Server Log] HttpClient constructor called.');
        this.apiKey = config.apiKey ?? process.env.LUNARCRUSH_API_KEY;
        if (!this.apiKey) {
            console.warn('[MCP Server Log] HttpClient Warning: LunarCrush API key is missing.'); // Keep warnings on stderr
        }
        // @ts-expect-error
        this.client = new (OpenAPIClientAxios.default ?? OpenAPIClientAxios)({
            definition: openApiSpec,
            axiosConfigDefaults: {
                baseURL: config.baseUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'lunarcrush-mcp-server',
                    ...config.headers,
                },
            },
        });
        // console.log('[MCP Server Log] OpenAPIClientAxios instance created.');
        this.api = this.client.init();
    }
    async prepareFileUpload(operation, params) {
        const fileParams = isFileUploadParameter(operation);
        if (fileParams.length === 0)
            return null;
        const formData = new FormData();
        // Handle file uploads
        for (const param of fileParams) {
            const filePath = params[param];
            if (!filePath) {
                throw new Error(`File path must be provided for parameter: ${param}`);
            }
            switch (typeof filePath) {
                case 'string':
                    addFile(param, filePath);
                    break;
                case 'object':
                    if (Array.isArray(filePath)) {
                        let fileCount = 0;
                        for (const file of filePath) {
                            addFile(param, file);
                            fileCount++;
                        }
                        break;
                    }
                //deliberate fallthrough
                default:
                    throw new Error(`Unsupported file type: ${typeof filePath}`);
            }
            function addFile(name, filePath) {
                try {
                    const fileStream = fs.createReadStream(filePath);
                    formData.append(name, fileStream);
                }
                catch (error) {
                    throw new Error(`Failed to read file at ${filePath}: ${error}`);
                }
            }
        }
        // Add non-file parameters to form data
        for (const [key, value] of Object.entries(params)) {
            if (!fileParams.includes(key)) {
                formData.append(key, value);
            }
        }
        return formData;
    }
    async handleRateLimit() {
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;
        if (timeSinceLast < this.requestIntervalMs) {
            const waitTime = this.requestIntervalMs - timeSinceLast;
            // console.log(`[MCP Server Log] Rate limiting HttpClient: waiting ${waitTime}ms`);
            await setTimeout(waitTime);
        }
        this.lastRequestTime = Date.now();
    }
    /**
     * Execute an OpenAPI operation
     */
    async executeOperation(operation, inputParams = {}) {
        await this.handleRateLimit();
        const api = await this.api;
        const method = operation.method.toUpperCase();
        let requestPath = operation.path;
        const queryParams = {};
        const paramsUsedInPathOrHeader = new Set(); // Keep track of params used in path or header
        let requestBody = undefined;
        let finalHeaders = {};
        let isFormData = false;
        // 1. Identify Path Parameters (from path string) and Substitute Path
        // Find placeholders like :param in the path string
        const pathPlaceholders = requestPath.match(/\:(\w+)/g)?.map(p => p.substring(1)) || [];
        for (const placeholder of pathPlaceholders) {
            if (inputParams[placeholder] !== undefined) {
                const value = inputParams[placeholder];
                requestPath = requestPath.replace(`:${placeholder}`, encodeURIComponent(String(value)));
                paramsUsedInPathOrHeader.add(placeholder); // Mark as used in path
            }
            else {
                // Check spec if this placeholder corresponds to a *required* path param
                // Note: The spec might wrongly define it as `in: query`, but we prioritize the path placeholder
                const specParam = operation.parameters?.find(p => 'in' in p && p.name === placeholder);
                if (specParam && 'required' in specParam && specParam.required) {
                    // console.error(`[MCP Server Log] Error: Missing required path parameter '${placeholder}' for ${method} ${operation.path}`); // Keep critical errors on stderr if needed, but comment out for now
                    throw new Error(`Missing required path parameter: ${placeholder}`);
                }
                // Optional: If not required, maybe log a warning or proceed if the API handles it
            }
        }
        // 2. Capture explicit header params from spec (if any)
        if (operation.parameters) {
            for (const param of operation.parameters) {
                // Only process parameters defined with in: "header"
                if ('in' in param && param.in === 'header' && param.name && inputParams[param.name] !== undefined) {
                    finalHeaders[param.name] = inputParams[param.name];
                    paramsUsedInPathOrHeader.add(param.name); // Mark header params as used
                }
            }
        }
        // 3. Handle Request Body for non-GET/DELETE methods
        if (method !== 'GET' && method !== 'DELETE' && operation.requestBody) {
            const content = (this.resolveRequestBody(operation.requestBody)?.content || {});
            if (content['multipart/form-data']) {
                const formData = new FormData();
                isFormData = true;
                for (const key in inputParams) {
                    // Only add if not used in path or header
                    if (!paramsUsedInPathOrHeader.has(key)) {
                        formData.append(key, inputParams[key]);
                    }
                }
                requestBody = formData;
                finalHeaders = { ...finalHeaders, ...formData.getHeaders() };
            }
            else { // Assume JSON body
                requestBody = {};
                for (const key in inputParams) {
                    // Only add if not used in path or header
                    if (!paramsUsedInPathOrHeader.has(key)) {
                        requestBody[key] = inputParams[key];
                    }
                }
                // Don't send empty body, ensure content-type if body exists
                if (Object.keys(requestBody).length > 0) {
                    finalHeaders['Content-Type'] = 'application/json';
                }
                else {
                    requestBody = undefined;
                }
            }
        }
        // 4. Populate Query Parameters: Add remaining inputParams NOT used in path or header, and not part of the request body (if applicable)
        for (const key in inputParams) {
            // Crucial check: ONLY add to query if NOT used in path or header
            if (!paramsUsedInPathOrHeader.has(key)) {
                // For non-GET/DELETE, also ensure it wasn't already put in the request body
                if (method === 'GET' || method === 'DELETE' || (requestBody?.[key] === undefined && !isFormData)) { // Don't add form data keys to query
                    queryParams[key] = inputParams[key];
                }
                // If it was FormData, it was handled in step 3, don't add to query.
            }
        }
        // --- API Key Injection (Bearer Token Only - current setup) ---
        if (this.apiKey) {
            finalHeaders['Authorization'] = `Bearer ${this.apiKey}`;
        }
        // ----------------------------------------------------
        const requestConfig = {
            method: method,
            url: requestPath, // Use the substituted path
            params: queryParams, // Use the filtered query parameters
            headers: finalHeaders,
            data: requestBody, // Request body
        };
        try {
            // console.log(`[MCP Server Log] Executing API call: ${method} ${requestConfig.url} with query=${JSON.stringify(queryParams)} headers=${JSON.stringify(finalHeaders)} body=${requestBody ? (isFormData ? '[FormData]' : JSON.stringify(requestBody)) : 'null'}`);
            const response = await api.request(requestConfig);
            const responseHeaders = new Headers();
            Object.entries(response.headers).forEach(([key, value]) => {
                if (value)
                    responseHeaders.append(key, value.toString());
            });
            return {
                data: response.data,
                status: response.status,
                headers: responseHeaders,
            };
        }
        catch (error) {
            // Keep existing error handling
            console.error(`[MCP Server Log] Error during API call for ${method} ${requestPath}:`, error.message);
            if (error.response) {
                // console.error(`[MCP Server Log] API Error Response Status: ${error.response.status}`); // Keep errors on stderr
                // console.error(`[MCP Server Log] API Error Response Headers: ${JSON.stringify(error.response.headers)}`); // Keep errors on stderr
                // console.error(`[MCP Server Log] API Error Response Data: ${JSON.stringify(error.response.data)}`); // Keep errors on stderr
                const headers = new Headers();
                Object.entries(error.response.headers).forEach(([key, value]) => {
                    if (value)
                        headers.append(key, value.toString());
                });
                throw new HttpClientError(error.response.statusText || 'Request failed', error.response.status, error.response.data, headers);
            }
            else {
                console.error('[MCP Server Log] Error object did not have response details.', error);
                throw error;
            }
        }
    }
    // Need resolveRequestBody (copied from parser, simplified or imported ideally)
    resolveRequestBody(body) {
        if (!('$ref' in body)) {
            return body;
        }
        else {
            // Basic ref resolution assuming it's within #/components/requestBodies/
            // This assumes the definition is available on the client instance after init()
            const definition = this.client.definition;
            if (!definition) {
                // console.error("[MCP Server Log] Error: OpenAPI definition not available on client instance for $ref resolution."); // Keep errors on stderr
                return null;
            }
            const ref = body.$ref;
            const parts = ref.replace(/^#\//, '').split('/');
            let current = definition;
            try {
                for (const part of parts) {
                    current = current?.[part];
                    if (current === undefined)
                        throw new Error(`Part '${part}' not found in path.`);
                }
                // Check if the resolved part is actually a RequestBodyObject
                if (typeof current === 'object' && current !== null && 'content' in current) {
                    return current;
                }
                else {
                    // console.error(`[MCP Server Log] Error: Resolved $ref '${ref}' did not point to a valid RequestBodyObject.`); // Keep errors on stderr
                    return null;
                }
            }
            catch (e) {
                // console.error(`[MCP Server Log] Error resolving $ref '${ref}': ${e.message}`); // Keep errors on stderr
                return null;
            }
        }
    }
    // Fallback for generating an operationId if missing in spec (consistent with parser)
    generateOperationIdFallback(method, path) {
        const parts = path.replace(/^\/|\/$/g, '').split('/').map(part => part.startsWith(':') ? part.substring(1) : part);
        return `${method.toLowerCase()}_${parts.join('_')}`;
    }
}
//# sourceMappingURL=http-client.js.map