import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadOrBuild, refresh as doRefresh } from './indexer.js';
import { searchTypes, getType, listNamespaces, getNamespace } from './search.js';
import { ParsedType } from './types.js';

const REPO_PATH  = process.env.FFXIV_STRUCTS_REPO;
const INDEX_PATH = process.env.FFXIV_STRUCTS_INDEX;

if (!REPO_PATH || !INDEX_PATH) {
  process.stderr.write('Error: FFXIV_STRUCTS_REPO and FFXIV_STRUCTS_INDEX must be set\n');
  process.exit(1);
}

let types: ParsedType[] = [];

const server = new McpServer({
  name: 'ffxiv-clientstructs',
  version: '1.0.0',
});

server.tool(
  'search_types',
  'Search for types by name or namespace. Returns brief info only (no fields/methods). Use get_type for full details.',
  { query: z.string().describe('Type name or namespace substring to search for') },
  async ({ query }) => {
    const results = searchTypes(types, query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  'get_type',
  'Get full definition of a type including all fields (with offsets) and methods. Accepts simple name or fully qualified name.',
  { name: z.string().describe('Type name, e.g. "ActionManager" or "FFXIVClientStructs.FFXIV.Client.Game.ActionManager"') },
  async ({ name }) => {
    const results = getType(types, name);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `Type "${name}" not found. Use search_types to find the correct name.` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(results.length === 1 ? results[0] : results, null, 2) }] };
  }
);

server.tool(
  'list_namespaces',
  'List all namespaces in the index. Use to discover available namespaces before calling get_namespace.',
  {},
  async () => {
    const ns = listNamespaces(types);
    return { content: [{ type: 'text', text: JSON.stringify(ns, null, 2) }] };
  }
);

server.tool(
  'get_namespace',
  'List all types in a namespace. Returns brief info only (no fields/methods).',
  { namespace: z.string().describe('Full namespace path, e.g. "FFXIVClientStructs.FFXIV.Client.Game"') },
  async ({ namespace }) => {
    const results = getNamespace(types, namespace);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No types found in namespace "${namespace}". Use list_namespaces to see available namespaces.` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  'refresh',
  'Run git pull on the FFXIVClientStructs repo and rebuild the index if the SHA changed. Use after a game patch.',
  {},
  async () => {
    const result = doRefresh(REPO_PATH!, INDEX_PATH!);
    types = result.index.types;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          sha: result.sha,
          rebuilt: result.rebuilt,
          typesIndexed: result.typesIndexed,
        }, null, 2),
      }],
    };
  }
);

async function main() {
  const result = loadOrBuild(REPO_PATH!, INDEX_PATH!);
  types = result.index.types;

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
