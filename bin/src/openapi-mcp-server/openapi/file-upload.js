/**
 * Identifies file upload parameters in an OpenAPI operation
 * @param operation The OpenAPI operation object to check
 * @returns Array of parameter names that are file uploads
 */
export function isFileUploadParameter(operation) {
    const fileParams = [];
    if (!operation.requestBody)
        return fileParams;
    const requestBody = operation.requestBody;
    const content = requestBody.content || {};
    // Check multipart/form-data content type for file uploads
    const multipartContent = content['multipart/form-data'];
    if (!multipartContent?.schema)
        return fileParams;
    const schema = multipartContent.schema;
    if (schema.type !== 'object' || !schema.properties)
        return fileParams;
    // Look for properties with type: string, format: binary which indicates file uploads
    Object.entries(schema.properties).forEach(([propName, prop]) => {
        const schemaProp = prop;
        if (schemaProp.type === 'string' && schemaProp.format === 'binary') {
            fileParams.push(propName);
        }
        // Check for array of files
        if (schemaProp.type === 'array' && schemaProp.items) {
            const itemSchema = schemaProp.items;
            if (itemSchema.type === 'string' && itemSchema.format === 'binary') {
                fileParams.push(propName);
            }
        }
    });
    return fileParams;
}
//# sourceMappingURL=file-upload.js.map