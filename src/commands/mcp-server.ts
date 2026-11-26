// Serve the race over MCP on stdin and stdout, for any MCP host.
// Usage: npm run mcp-server (normally started by the host, not by hand)

import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createRaceServer } from "../mcp/race-server.ts";
import { snapshotLinks } from "../wikipedia/snapshot.ts";
import { fetchLinks } from "../wikipedia/wikipedia.ts";

// The host may start the server from any folder, so find the snapshot from here.
const SNAPSHOT_DIR = fileURLToPath(new URL("../../snapshot", import.meta.url));

// stdout carries the protocol: anything else written there breaks it.
const server = createRaceServer(snapshotLinks(SNAPSHOT_DIR, fetchLinks));
await server.connect(new StdioServerTransport());
