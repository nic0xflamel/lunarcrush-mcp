#!/usr/bin/env node
import type { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import type { JSONSchema7 as IJsonSchema } from 'json-schema';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
type NewToolMethod = {
    name: string;
    description: string;
    inputSchema: IJsonSchema & {
        type: 'object';
    };
    returnSchema?: IJsonSchema;
};
export declare class OpenAPIToMCPConverter {
    private openApiSpec;
    private schemaCache;
    private nameCounter;
    constructor(openApiSpec: OpenAPIV3.Document | OpenAPIV3_1.Document);
    /**
     * Resolve a $ref reference to its schema in the openApiSpec.
     * Returns the raw OpenAPI SchemaObject or null if not found.
     */
    private internalResolveRef;
    /**
     * Convert an OpenAPI schema (or reference) into a JSON Schema object.
     * Uses caching and handles cycles by returning $ref nodes.
     */
    convertOpenApiSchemaToJsonSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, resolvedRefs: Set<string>, resolveRefs?: boolean, name?: string): IJsonSchema;
    convertToMCPTools(): {
        tools: Record<string, {
            methods: NewToolMethod[];
        }>;
        openApiLookup: Record<string, OpenAPIV3.OperationObject & {
            method: string;
            path: string;
        }>;
        zip: Record<string, {
            openApi: OpenAPIV3.OperationObject & {
                method: string;
                path: string;
            };
            mcp: NewToolMethod;
        }>;
    };
    /**
     * Convert the OpenAPI spec to OpenAI's ChatCompletionTool format
     */
    convertToOpenAITools(): ChatCompletionTool[];
    /**
     * Convert the OpenAPI spec to Anthropic's Tool format
     */
    convertToAnthropicTools(): Tool[];
    private convertComponentsToJsonSchema;
    /**
     * Helper method to convert an operation to a JSON Schema for parameters
     */
    private convertOperationToJsonSchema;
    private isOperation;
    private isParameterObject;
    private isRequestBodyObject;
    private resolveParameter;
    private resolveRequestBody;
    private resolveResponse;
    private convertOperationToMCPMethod;
    private extractResponseType;
    private ensureUniqueName;
    private generateUniqueSuffix;
    private generateNameFromPath;
}
export {};
//# sourceMappingURL=parser.d.ts.map