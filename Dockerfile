# Generated by https://smithery.ai. See: https://smithery.ai/docs/config#dockerfile
# Generated by https://smithery.ai. See: https://smithery.ai/docs/config#dockerfile
# syntax=docker/dockerfile:1

# --- Builder Stage ---
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (including dev) needed for the build
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# Copy the rest of the source code
COPY . .

# Build the package (compiles TS to JS in bin/)
RUN npm run build

# --- Final Stage ---
FROM node:20-slim

WORKDIR /app

# Copy package files from builder
COPY --from=builder /app/package*.json ./

# Install ONLY production dependencies
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

# Copy built code, specs, and the entrypoint script from builder
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/specs ./specs
COPY --from=builder /app/scripts/cli.cjs ./scripts/cli.cjs

# Ensure the entrypoint script is executable (already done by npm run build, but good to be sure)
RUN chmod +x ./scripts/cli.cjs

# Set default environment variables (if needed, like the example)
# ENV OPENAPI_MCP_HEADERS="{}"

# Use CMD instead of ENTRYPOINT to allow overriding
# Execute the server using the CJS entrypoint script specified in package.json bin
CMD ["node", "./scripts/cli.cjs"]
