# LunarCrush MCP Server

[![smithery badge](https://smithery.ai/badge/@nic0xflamel/lunarcrush-mcp-server)](https://smithery.ai/server/@nic0xflamel/lunarcrush-mcp-server)

This package provides a Model Context Protocol (MCP) server that acts as a proxy to the **LunarCrush Enterprise API**. It allows AI assistants (like Cursor) to interact with the LunarCrush API through a provided OpenAPI specification.

## Features

*   Implements the Model Context Protocol for standardized communication.
*   Uses the [LunarCrush Enterprise API](https://enterprise.lunarcrush.com/api).
*   Parses an OpenAPI specification to dynamically generate API methods.
*   Handles API Key authentication (assuming it's needed, needs implementation).
*   Can be run locally and configured within environments like Cursor and Claude Desktop.

## Installation
### Installing via Smithery

To install the LunarCrush API Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@nic0xflamel/lunarcrush-mcp-server):

```bash
npx -y @smithery/cli install @nic0xflamel/lunarcrush-mcp-server --client claude
```

### Manual Installation
    ```json
    {
      "mcpServers": {
        "lunarcrush": {
          "command": "npx",
          "args": [
            "-y",
            "@nic0xflamel/lunarcrush-mcp-server"
          ]
        }
      }
    }
    ```

## License

MIT
