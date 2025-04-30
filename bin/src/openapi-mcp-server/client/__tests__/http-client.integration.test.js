import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HttpClient } from '../http-client';
//@ts-ignore
import { createPetstoreServer } from '../../../examples/petstore-server.cjs';
import axios from 'axios';
describe('HttpClient Integration Tests', () => {
    const PORT = 3456;
    const BASE_URL = `http://localhost:${PORT}`;
    let server;
    let openApiSpec;
    let client;
    beforeAll(async () => {
        // Start the petstore server
        server = createPetstoreServer(PORT);
        // Fetch the OpenAPI spec from the server
        const response = await axios.get(`${BASE_URL}/openapi.json`);
        openApiSpec = response.data;
        // Create HTTP client
        client = new HttpClient({
            baseUrl: BASE_URL,
            headers: {
                Accept: 'application/json',
            },
        }, openApiSpec);
    });
    afterAll(() => {
        //@ts-expect-error
        server.close();
    });
    it('should list all pets', async () => {
        const operation = openApiSpec.paths['/pets']?.get;
        if (!operation)
            throw new Error('Operation not found');
        const response = await client.executeOperation(operation);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.data.length).toBeGreaterThan(0);
        expect(response.data[0]).toHaveProperty('name');
        expect(response.data[0]).toHaveProperty('species');
        expect(response.data[0]).toHaveProperty('status');
    });
    it('should filter pets by status', async () => {
        const operation = openApiSpec.paths['/pets']?.get;
        if (!operation)
            throw new Error('Operation not found');
        const response = await client.executeOperation(operation, { status: 'available' });
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
        response.data.forEach((pet) => {
            expect(pet.status).toBe('available');
        });
    });
    it('should get a specific pet by ID', async () => {
        const operation = openApiSpec.paths['/pets/{id}']?.get;
        if (!operation)
            throw new Error('Operation not found');
        const response = await client.executeOperation(operation, { id: 1 });
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('id', 1);
        expect(response.data).toHaveProperty('name');
        expect(response.data).toHaveProperty('species');
    });
    it('should create a new pet', async () => {
        const operation = openApiSpec.paths['/pets']?.post;
        if (!operation)
            throw new Error('Operation not found');
        const newPet = {
            name: 'TestPet',
            species: 'Dog',
            age: 2,
        };
        const response = await client.executeOperation(operation, newPet);
        expect(response.status).toBe(201);
        expect(response.data).toMatchObject({
            ...newPet,
            status: 'available',
        });
        expect(response.data.id).toBeDefined();
    });
    it("should update a pet's status", async () => {
        const operation = openApiSpec.paths['/pets/{id}']?.put;
        if (!operation)
            throw new Error('Operation not found');
        const response = await client.executeOperation(operation, {
            id: 1,
            status: 'sold',
        });
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('id', 1);
        expect(response.data).toHaveProperty('status', 'sold');
    });
    it('should delete a pet', async () => {
        // First create a pet to delete
        const createOperation = openApiSpec.paths['/pets']?.post;
        if (!createOperation)
            throw new Error('Operation not found');
        const createResponse = await client.executeOperation(createOperation, {
            name: 'ToDelete',
            species: 'Cat',
            age: 3,
        });
        const petId = createResponse.data.id;
        // Then delete it
        const deleteOperation = openApiSpec.paths['/pets/{id}']?.delete;
        if (!deleteOperation)
            throw new Error('Operation not found');
        const deleteResponse = await client.executeOperation(deleteOperation, {
            id: petId,
        });
        expect(deleteResponse.status).toBe(204);
        // Verify the pet is deleted
        const getOperation = openApiSpec.paths['/pets/{id}']?.get;
        if (!getOperation)
            throw new Error('Operation not found');
        try {
            await client.executeOperation(getOperation, { id: petId });
            throw new Error('Should not reach here');
        }
        catch (error) {
            expect(error.message).toContain('404');
        }
    });
    it('should handle errors appropriately', async () => {
        const operation = openApiSpec.paths['/pets/{id}']?.get;
        if (!operation)
            throw new Error('Operation not found');
        try {
            await client.executeOperation(operation, { id: 99999 });
            throw new Error('Should not reach here');
        }
        catch (error) {
            expect(error.message).toContain('404');
        }
    });
});
//# sourceMappingURL=http-client.integration.test.js.map