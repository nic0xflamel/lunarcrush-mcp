import { MCPProxy } from '../proxy';
import { HttpClient } from '../../client/http-client';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
// Mock the dependencies
vi.mock('../../client/http-client');
vi.mock('@modelcontextprotocol/sdk/server/index.js');
describe('MCPProxy', () => {
    let proxy;
    let mockOpenApiSpec;
    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        // Setup minimal OpenAPI spec for testing
        mockOpenApiSpec = {
            openapi: '3.0.0',
            servers: [{ url: 'http://localhost:3000' }],
            info: {
                title: 'Test API',
                version: '1.0.0',
            },
            paths: {
                '/test': {
                    get: {
                        operationId: 'getTest',
                        responses: {
                            '200': {
                                description: 'Success',
                            },
                        },
                    },
                },
            },
        };
        proxy = new MCPProxy('test-proxy', mockOpenApiSpec);
    });
    describe('listTools handler', () => {
        it('should return converted tools from OpenAPI spec', async () => {
            const server = proxy.server;
            const listToolsHandler = server.setRequestHandler.mock.calls[0].filter((x) => typeof x === 'function')[0];
            const result = await listToolsHandler();
            expect(result).toHaveProperty('tools');
            expect(Array.isArray(result.tools)).toBe(true);
        });
        it('should truncate tool names exceeding 64 characters', async () => {
            // Setup OpenAPI spec with long tool names
            mockOpenApiSpec.paths = {
                '/test': {
                    get: {
                        operationId: 'a'.repeat(65),
                        responses: {
                            '200': {
                                description: 'Success'
                            }
                        }
                    }
                }
            };
            proxy = new MCPProxy('test-proxy', mockOpenApiSpec);
            const server = proxy.server;
            const listToolsHandler = server.setRequestHandler.mock.calls[0].filter((x) => typeof x === 'function')[0];
            const result = await listToolsHandler();
            expect(result.tools[0].name.length).toBeLessThanOrEqual(64);
        });
    });
    describe('callTool handler', () => {
        it('should execute operation and return formatted response', async () => {
            // Mock HttpClient response
            const mockResponse = {
                data: { message: 'success' },
                status: 200,
                headers: new Headers({
                    'content-type': 'application/json',
                }),
            };
            HttpClient.prototype.executeOperation.mockResolvedValue(mockResponse);
            proxy.openApiLookup = {
                'API-getTest': {
                    operationId: 'getTest',
                    responses: { '200': { description: 'Success' } },
                    method: 'get',
                    path: '/test',
                },
            };
            const server = proxy.server;
            const handlers = server.setRequestHandler.mock.calls.flatMap((x) => x).filter((x) => typeof x === 'function');
            const callToolHandler = handlers[1];
            const result = await callToolHandler({
                params: {
                    name: 'API-getTest',
                    arguments: {},
                },
            });
            expect(result).toEqual({
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ message: 'success' }),
                    },
                ],
            });
        });
        it('should throw error for non-existent operation', async () => {
            const server = proxy.server;
            const handlers = server.setRequestHandler.mock.calls.flatMap((x) => x).filter((x) => typeof x === 'function');
            const callToolHandler = handlers[1];
            await expect(callToolHandler({
                params: {
                    name: 'nonExistentMethod',
                    arguments: {},
                },
            })).rejects.toThrow('Method nonExistentMethod not found');
        });
        it('should handle tool names exceeding 64 characters', async () => {
            // Mock HttpClient response
            const mockResponse = {
                data: { message: 'success' },
                status: 200,
                headers: new Headers({
                    'content-type': 'application/json'
                })
            };
            HttpClient.prototype.executeOperation.mockResolvedValue(mockResponse);
            // Set up the openApiLookup with a long tool name
            const longToolName = 'a'.repeat(65);
            const truncatedToolName = longToolName.slice(0, 64);
            proxy.openApiLookup = {
                [truncatedToolName]: {
                    operationId: longToolName,
                    responses: { '200': { description: 'Success' } },
                    method: 'get',
                    path: '/test'
                }
            };
            const server = proxy.server;
            const handlers = server.setRequestHandler.mock.calls.flatMap((x) => x).filter((x) => typeof x === 'function');
            const callToolHandler = handlers[1];
            const result = await callToolHandler({
                params: {
                    name: truncatedToolName,
                    arguments: {}
                }
            });
            expect(result).toEqual({
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ message: 'success' })
                    }
                ]
            });
        });
    });
    describe('getContentType', () => {
        it('should return correct content type for different headers', () => {
            const getContentType = proxy.getContentType.bind(proxy);
            expect(getContentType(new Headers({ 'content-type': 'text/plain' }))).toBe('text');
            expect(getContentType(new Headers({ 'content-type': 'application/json' }))).toBe('text');
            expect(getContentType(new Headers({ 'content-type': 'image/jpeg' }))).toBe('image');
            expect(getContentType(new Headers({ 'content-type': 'application/octet-stream' }))).toBe('binary');
            expect(getContentType(new Headers())).toBe('binary');
        });
    });
    describe('parseHeadersFromEnv', () => {
        const originalEnv = process.env;
        beforeEach(() => {
            process.env = { ...originalEnv };
        });
        afterEach(() => {
            process.env = originalEnv;
        });
        it('should parse valid JSON headers from env', () => {
            process.env.OPENAPI_MCP_HEADERS = JSON.stringify({
                Authorization: 'Bearer token123',
                'X-Custom-Header': 'test',
            });
            const proxy = new MCPProxy('test-proxy', mockOpenApiSpec);
            expect(HttpClient).toHaveBeenCalledWith(expect.objectContaining({
                headers: {
                    Authorization: 'Bearer token123',
                    'X-Custom-Header': 'test',
                },
            }), expect.anything());
        });
        it('should return empty object when env var is not set', () => {
            delete process.env.OPENAPI_MCP_HEADERS;
            const proxy = new MCPProxy('test-proxy', mockOpenApiSpec);
            expect(HttpClient).toHaveBeenCalledWith(expect.objectContaining({
                headers: {},
            }), expect.anything());
        });
        it('should return empty object and warn on invalid JSON', () => {
            const consoleSpy = vi.spyOn(console, 'warn');
            process.env.OPENAPI_MCP_HEADERS = 'invalid json';
            const proxy = new MCPProxy('test-proxy', mockOpenApiSpec);
            expect(HttpClient).toHaveBeenCalledWith(expect.objectContaining({
                headers: {},
            }), expect.anything());
            expect(consoleSpy).toHaveBeenCalledWith('Failed to parse OPENAPI_MCP_HEADERS environment variable:', expect.any(Error));
        });
        it('should return empty object and warn on non-object JSON', () => {
            const consoleSpy = vi.spyOn(console, 'warn');
            process.env.OPENAPI_MCP_HEADERS = '"string"';
            const proxy = new MCPProxy('test-proxy', mockOpenApiSpec);
            expect(HttpClient).toHaveBeenCalledWith(expect.objectContaining({
                headers: {},
            }), expect.anything());
            expect(consoleSpy).toHaveBeenCalledWith('OPENAPI_MCP_HEADERS environment variable must be a JSON object, got:', 'string');
        });
    });
    describe('connect', () => {
        it('should connect to transport', async () => {
            const mockTransport = {};
            await proxy.connect(mockTransport);
            const server = proxy.server;
            expect(server.connect).toHaveBeenCalledWith(mockTransport);
        });
    });
});
//# sourceMappingURL=proxy.test.js.map