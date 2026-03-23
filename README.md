# mcp-xiv-clientstructs

An MCP server that indexes the [FFXIVClientStructs](https://github.com/aers/FFXIVClientStructs) C# library and exposes it as searchable tools for any MCP-compatible AI assistant. Useful when writing [Dalamud](https://github.com/goatcorp/Dalamud) plugins.

## Tools

| Tool | Description |
|------|-------------|
| `search_types` | Search types by name or namespace — returns brief results (no fields/methods) |
| `get_type` | Full type definition: fields with offsets, methods, size, inheritance |
| `list_namespaces` | All available namespaces |
| `get_namespace` | All types in a namespace (brief) |
| `refresh` | Run `git pull` on the repo and rebuild the index if the SHA changed |

## Environment variables

| Variable | Description |
|----------|-------------|
| `FFXIV_STRUCTS_REPO` | Path to a local clone of [FFXIVClientStructs](https://github.com/aers/FFXIVClientStructs) |
| `FFXIV_STRUCTS_INDEX` | Path where the server writes its `index.json` cache (does not need to exist beforehand) |

Both are required. The server will exit on startup if either is missing.

## Setup

**1. Clone FFXIVClientStructs somewhere:**
```bash
git clone https://github.com/aers/FFXIVClientStructs.git /path/to/ffxiv_clientstructs_repo
```

**2. Install and build:**
```bash
npm install
npm run build
```

**3. Add to your MCP host's config:**
```json
{
  "mcpServers": {
    "ffxiv-structs": {
      "command": "node",
      "args": ["/path/to/mcp-xiv-clientstructs/dist/index.js"],
      "env": {
        "FFXIV_STRUCTS_REPO": "/path/to/ffxiv_clientstructs_repo",
        "FFXIV_STRUCTS_INDEX": "/path/to/mcp-xiv-clientstructs/index.json"
      }
    }
  }
}
```

On first start the index is built automatically (~2–5s). Subsequent starts load the cached index instantly unless the repo SHA has changed.

## Keeping up to date

On every start, the server compares the repo's current git SHA against the cached index. If they differ (e.g. because you pulled externally), it rebuilds automatically.

The `refresh` tool does this in one step without a restart: it runs `git pull` on the repo and rebuilds the index if the SHA changed. Useful to call after a game patch.
