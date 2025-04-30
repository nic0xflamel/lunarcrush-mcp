#!/usr/bin/env node
export class OpenAPIToMCPConverter {
    constructor(openApiSpec) {
        this.openApiSpec = openApiSpec;
        this.schemaCache = {};
        this.nameCounter = 0;
    }
    /**
     * Resolve a $ref reference to its schema in the openApiSpec.
     * Returns the raw OpenAPI SchemaObject or null if not found.
     */
    internalResolveRef(ref, resolvedRefs) {
        if (!ref.startsWith('#/')) {
            return null;
        }
        if (resolvedRefs.has(ref)) {
            return null;
        }
        const parts = ref.replace(/^#\//, '').split('/');
        let current = this.openApiSpec;
        for (const part of parts) {
            current = current[part];
            if (!current)
                return null;
        }
        resolvedRefs.add(ref);
        return current;
    }
    /**
     * Convert an OpenAPI schema (or reference) into a JSON Schema object.
     * Uses caching and handles cycles by returning $ref nodes.
     */
    convertOpenApiSchemaToJsonSchema(schema, resolvedRefs, resolveRefs = false, name) {
        if ('$ref' in schema) {
            const ref = schema.$ref;
            if (!resolveRefs) {
                if (ref.startsWith('#/components/schemas/')) {
                    return {
                        $ref: ref.replace(/^#\/components\/schemas\//, '#/$defs/'),
                        ...('description' in schema ? { description: schema.description } : {}),
                    };
                }
                // console.error(`Attempting to resolve ref ${ref} not found in components collection.`); // Commented out
                // deliberate fall through
            }
            // Create base schema with $ref and description if present
            const refSchema = { $ref: ref };
            if ('description' in schema && schema.description) {
                refSchema.description = schema.description;
            }
            // If already cached, return immediately with description
            if (this.schemaCache[ref]) {
                return this.schemaCache[ref];
            }
            const resolved = this.internalResolveRef(ref, resolvedRefs);
            if (!resolved) {
                // TODO: need extensive tests for this and we definitely need to handle the case of self references
                // console.error(`Failed to resolve ref ${ref}`); // Commented out
                return {
                    $ref: ref.replace(/^#\/components\/schemas\//, '#/$defs/'),
                    description: 'description' in schema ? (schema.description ?? '') : '',
                };
            }
            else {
                const converted = this.convertOpenApiSchemaToJsonSchema(resolved, resolvedRefs, resolveRefs, name);
                this.schemaCache[ref] = converted;
                return converted;
            }
        }
        // Handle inline schema
        const result = {};
        const baseDescription = 'description' in schema ? schema.description : undefined;
        const originalType = 'type' in schema ? schema.type : undefined;
        // --- Handle potentially non-standard 'timestamp' type --- 
        // Use type assertion to check for 'timestamp' despite base types
        if (originalType === 'timestamp') {
            result.type = 'integer'; // Convert to integer for Unix timestamp
            result.description = baseDescription ? `${baseDescription} (Unix timestamp)` : 'Unix timestamp';
        }
        else if (originalType) {
            result.type = originalType; // Use the standard type
            if (baseDescription) {
                result.description = baseDescription;
            }
        }
        else if (baseDescription) { // Handle case where only description might be present without type
            result.description = baseDescription;
        }
        // -------------------------------------------------------
        // Convert binary format to uri-reference and enhance description
        if ('format' in schema && schema.format === 'binary') {
            result.format = 'uri-reference';
            const binaryDesc = 'absolute paths to local files';
            // Append binary format info, don't overwrite if description already set (e.g., by timestamp logic)
            result.description = result.description ? `${result.description} (${binaryDesc})` : binaryDesc;
        }
        else if ('format' in schema && schema.format) { // Only add format if not binary
            result.format = schema.format;
        }
        if (schema.enum) {
            result.enum = schema.enum;
        }
        if (schema.default !== undefined) {
            result.default = schema.default;
        }
        // Handle object properties
        if (schema.type === 'object') {
            result.type = 'object';
            if (schema.properties) {
                result.properties = {};
                for (const [name, propSchema] of Object.entries(schema.properties)) {
                    result.properties[name] = this.convertOpenApiSchemaToJsonSchema(propSchema, resolvedRefs, resolveRefs, name);
                }
            }
            if (schema.required) {
                result.required = schema.required;
            }
            if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
                result.additionalProperties = true;
            }
            else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
                result.additionalProperties = this.convertOpenApiSchemaToJsonSchema(schema.additionalProperties, resolvedRefs, resolveRefs, name);
            }
            else {
                result.additionalProperties = false;
            }
        }
        // Handle arrays - ensure binary format conversion happens for array items too
        if (schema.type === 'array' && schema.items) {
            result.type = 'array';
            result.items = this.convertOpenApiSchemaToJsonSchema(schema.items, resolvedRefs, resolveRefs, name);
        }
        // oneOf, anyOf, allOf
        if (schema.oneOf) {
            result.oneOf = schema.oneOf.map((s) => this.convertOpenApiSchemaToJsonSchema(s, resolvedRefs, resolveRefs, name));
        }
        if (schema.anyOf) {
            result.anyOf = schema.anyOf.map((s) => this.convertOpenApiSchemaToJsonSchema(s, resolvedRefs, resolveRefs, name));
        }
        if (schema.allOf) {
            result.allOf = schema.allOf.map((s) => this.convertOpenApiSchemaToJsonSchema(s, resolvedRefs, resolveRefs, name));
        }
        return result;
    }
    convertToMCPTools() {
        const apiName = 'API';
        // Define the list of allowed PATHS
        const allowedPaths = new Set([
            '/public/topic/:topic/v1',
            '/public/topic/:topic/time-series/v2',
            '/public/topic/:topic/posts/v1',
            '/public/topic/:topic/news/v1',
            '/public/coins/list/v2',
            '/public/coins/:coin/v1',
            '/public/coins/:coin/time-series/v2'
        ]);
        const openApiLookup = {};
        const tools = {
            [apiName]: { methods: [] },
        };
        const zip = {};
        for (const [path, pathItem] of Object.entries(this.openApiSpec.paths || {})) {
            if (!pathItem)
                continue;
            // Filter based on path
            if (!allowedPaths.has(path)) {
                continue; // Skip this path if it's not in the allowed list
            }
            for (const [method, operation] of Object.entries(pathItem)) {
                if (!this.isOperation(method, operation))
                    continue;
                // Generate a name based on method and path if operationId is missing
                const baseName = operation.operationId ?? this.generateNameFromPath(method, path);
                const mcpMethod = this.convertOperationToMCPMethod(operation, method, path, baseName); // Pass baseName
                if (mcpMethod) {
                    // Use the generated/provided baseName for lookup and tool structure
                    const uniqueName = this.ensureUniqueName(baseName);
                    mcpMethod.name = uniqueName; // Use the unique name for the MCP method
                    // Store using the unique name
                    tools[apiName].methods.push(mcpMethod);
                    openApiLookup[apiName + '-' + uniqueName] = { ...operation, method, path };
                    zip[apiName + '-' + uniqueName] = { openApi: { ...operation, method, path }, mcp: mcpMethod };
                }
            }
        }
        return { tools, openApiLookup, zip };
    }
    /**
     * Convert the OpenAPI spec to OpenAI's ChatCompletionTool format
     */
    convertToOpenAITools() {
        const tools = [];
        for (const [path, pathItem] of Object.entries(this.openApiSpec.paths || {})) {
            if (!pathItem)
                continue;
            for (const [method, operation] of Object.entries(pathItem)) {
                if (!this.isOperation(method, operation))
                    continue;
                const parameters = this.convertOperationToJsonSchema(operation, method, path);
                const tool = {
                    type: 'function',
                    function: {
                        name: operation.operationId,
                        description: operation.summary || operation.description || '',
                        parameters: parameters,
                    },
                };
                tools.push(tool);
            }
        }
        return tools;
    }
    /**
     * Convert the OpenAPI spec to Anthropic's Tool format
     */
    convertToAnthropicTools() {
        const tools = [];
        for (const [path, pathItem] of Object.entries(this.openApiSpec.paths || {})) {
            if (!pathItem)
                continue;
            for (const [method, operation] of Object.entries(pathItem)) {
                if (!this.isOperation(method, operation))
                    continue;
                const parameters = this.convertOperationToJsonSchema(operation, method, path);
                const tool = {
                    name: operation.operationId,
                    description: operation.summary || operation.description || '',
                    input_schema: parameters,
                };
                tools.push(tool);
            }
        }
        return tools;
    }
    convertComponentsToJsonSchema() {
        const components = this.openApiSpec.components || {};
        const schema = {};
        for (const [key, value] of Object.entries(components.schemas || {})) {
            schema[key] = this.convertOpenApiSchemaToJsonSchema(value, new Set());
        }
        return schema;
    }
    /**
     * Helper method to convert an operation to a JSON Schema for parameters
     */
    convertOperationToJsonSchema(operation, method, path) {
        const schema = {
            type: 'object',
            properties: {},
            required: [],
            $defs: this.convertComponentsToJsonSchema(),
        };
        // Handle parameters (path, query, header, cookie)
        if (operation.parameters) {
            for (const param of operation.parameters) {
                const paramObj = this.resolveParameter(param);
                if (paramObj && paramObj.schema) {
                    const paramSchema = this.convertOpenApiSchemaToJsonSchema(paramObj.schema, new Set(), false, paramObj.name);
                    // Merge parameter-level description if available
                    if (paramObj.description) {
                        paramSchema.description = paramObj.description;
                    }
                    schema.properties[paramObj.name] = paramSchema;
                    if (paramObj.required) {
                        schema.required.push(paramObj.name);
                    }
                }
            }
        }
        // Handle requestBody
        if (operation.requestBody) {
            const bodyObj = this.resolveRequestBody(operation.requestBody);
            if (bodyObj?.content) {
                if (bodyObj.content['application/json']?.schema) {
                    const bodySchema = this.convertOpenApiSchemaToJsonSchema(bodyObj.content['application/json'].schema, new Set(), false);
                    if (bodySchema.type === 'object' && bodySchema.properties) {
                        for (const [name, propSchema] of Object.entries(bodySchema.properties)) {
                            schema.properties[name] = propSchema;
                        }
                        if (bodySchema.required) {
                            schema.required.push(...bodySchema.required);
                        }
                    }
                }
            }
        }
        return schema;
    }
    isOperation(method, operation) {
        return ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase());
    }
    isParameterObject(param) {
        return !('$ref' in param);
    }
    isRequestBodyObject(body) {
        return !('$ref' in body);
    }
    resolveParameter(param) {
        if (this.isParameterObject(param)) {
            return param;
        }
        else {
            const resolved = this.internalResolveRef(param.$ref, new Set());
            if (resolved && resolved.name) {
                return resolved;
            }
        }
        return null;
    }
    resolveRequestBody(body) {
        if (this.isRequestBodyObject(body)) {
            return body;
        }
        else {
            const resolved = this.internalResolveRef(body.$ref, new Set());
            if (resolved) {
                return resolved;
            }
        }
        return null;
    }
    resolveResponse(response) {
        if ('$ref' in response) {
            const resolved = this.internalResolveRef(response.$ref, new Set());
            if (resolved) {
                return resolved;
            }
            else {
                return null;
            }
        }
        return response;
    }
    convertOperationToMCPMethod(operation, method, path, baseName) {
        // Use the provided baseName instead of relying on operation.operationId directly
        const methodName = baseName;
        const inputSchema = {
            $defs: this.convertComponentsToJsonSchema(),
            type: 'object',
            properties: {},
            required: [],
        };
        // Handle parameters (path, query, header, cookie)
        if (operation.parameters) {
            for (const param of operation.parameters) {
                const paramObj = this.resolveParameter(param);
                if (paramObj && paramObj.schema) {
                    const schema = this.convertOpenApiSchemaToJsonSchema(paramObj.schema, new Set(), false);
                    // --- Improve parameter description --- 
                    let paramDescription = paramObj.description || '';
                    if (paramObj.name === 'topic') {
                        paramDescription = `The specific social topic to query (e.g., 'bitcoin', 'ethereum'). ${paramDescription}`;
                    }
                    else if (paramObj.name === 'coin') {
                        paramDescription = `The coin symbol or ID (e.g., 'BTC', 'ETH', or numeric ID from coins list). ${paramDescription}`;
                    }
                    schema.description = paramDescription.trim(); // Use updated description
                    // -------------------------------------
                    inputSchema.properties[paramObj.name] = schema;
                    if (paramObj.required) {
                        inputSchema.required.push(paramObj.name);
                    }
                }
            }
        }
        // Handle requestBody
        if (operation.requestBody) {
            const bodyObj = this.resolveRequestBody(operation.requestBody);
            if (bodyObj?.content) {
                // Handle multipart/form-data for file uploads
                // We convert the multipart/form-data schema to a JSON schema and we require
                // that the user passes in a string for each file that points to the local file
                if (bodyObj.content['multipart/form-data']?.schema) {
                    const formSchema = this.convertOpenApiSchemaToJsonSchema(bodyObj.content['multipart/form-data'].schema, new Set(), false);
                    if (formSchema.type === 'object' && formSchema.properties) {
                        for (const [name, propSchema] of Object.entries(formSchema.properties)) {
                            inputSchema.properties[name] = propSchema;
                        }
                        if (formSchema.required) {
                            inputSchema.required.push(...formSchema.required);
                        }
                    }
                }
                // Handle application/json
                else if (bodyObj.content['application/json']?.schema) {
                    const bodySchema = this.convertOpenApiSchemaToJsonSchema(bodyObj.content['application/json'].schema, new Set(), false);
                    // Merge body schema into the inputSchema's properties
                    if (bodySchema.type === 'object' && bodySchema.properties) {
                        for (const [name, propSchema] of Object.entries(bodySchema.properties)) {
                            inputSchema.properties[name] = propSchema;
                        }
                        if (bodySchema.required) {
                            inputSchema.required.push(...bodySchema.required);
                        }
                    }
                    else {
                        // If the request body is not an object, just put it under "body"
                        inputSchema.properties['body'] = bodySchema;
                        inputSchema.required.push('body');
                    }
                }
            }
        }
        // Build description including error responses
        let description = operation.summary || operation.description || '';
        if (operation.responses) {
            const errorResponses = Object.entries(operation.responses)
                .filter(([code]) => code.startsWith('4') || code.startsWith('5'))
                .map(([code, response]) => {
                const responseObj = this.resolveResponse(response);
                let errorDesc = responseObj?.description || '';
                return `${code}: ${errorDesc}`;
            });
            if (errorResponses.length > 0) {
                description += '\nError Responses:\n' + errorResponses.join('\n');
            }
        }
        // Extract return type (response schema)
        const returnSchema = this.extractResponseType(operation.responses);
        return {
            name: methodName, // Use the generated/provided base name
            description,
            inputSchema,
            ...(returnSchema ? { returnSchema } : {}),
        };
    }
    extractResponseType(responses) {
        // Look for a success response
        const successResponse = responses?.['200'] || responses?.['201'] || responses?.['202'] || responses?.['204'];
        if (!successResponse)
            return null;
        const responseObj = this.resolveResponse(successResponse);
        if (!responseObj || !responseObj.content)
            return null;
        if (responseObj.content['application/json']?.schema) {
            const returnSchema = this.convertOpenApiSchemaToJsonSchema(responseObj.content['application/json'].schema, new Set(), false);
            returnSchema['$defs'] = this.convertComponentsToJsonSchema();
            // Preserve the response description if available and not already set
            if (responseObj.description && !returnSchema.description) {
                returnSchema.description = responseObj.description;
            }
            return returnSchema;
        }
        // If no JSON response, fallback to a generic string or known formats
        if (responseObj.content['image/png'] || responseObj.content['image/jpeg']) {
            return { type: 'string', format: 'binary', description: responseObj.description || '' };
        }
        // Fallback
        return { type: 'string', description: responseObj.description || '' };
    }
    ensureUniqueName(name) {
        if (name.length <= 64) {
            return name;
        }
        const truncatedName = name.slice(0, 64 - 5); // Reserve space for suffix
        const uniqueSuffix = this.generateUniqueSuffix();
        return `${truncatedName}-${uniqueSuffix}`;
    }
    generateUniqueSuffix() {
        this.nameCounter += 1;
        return this.nameCounter.toString().padStart(4, '0');
    }
    // Helper to generate a name like get_public_topic_topic_v1
    generateNameFromPath(method, path) {
        // Remove leading/trailing slashes, replace slashes and placeholders with underscores
        const parts = path.replace(/^\/|\/$/g, '').split('/').map(part => part.startsWith(':') ? part.substring(1) : part);
        return `${method.toLowerCase()}_${parts.join('_')}`;
    }
}
//# sourceMappingURL=parser.js.map