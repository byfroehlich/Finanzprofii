// Kleiner MCP-Server (stdio, JSON-RPC je Zeile) mit den Werkzeugen der Zentrale.
// Claude bekommt nur diese Werkzeuge – keine Shell.
import { createInterface } from "node:readline";
import { WERKZEUGE } from "./werkzeuge.ts";

type Anfrage = { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, any> };

function sende(o: unknown) {
  process.stdout.write(JSON.stringify(o) + "\n");
}

async function bearbeite(a: Anfrage): Promise<unknown> {
  switch (a.method) {
    case "initialize":
      return {
        protocolVersion: a.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "zentrale", version: "1.0.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: Object.entries(WERKZEUGE).map(([name, w]) => ({
          name, description: w.beschreibung, inputSchema: w.schema,
          annotations: { readOnlyHint: !w.schreibt },
        })),
      };
    case "tools/call": {
      const name = String(a.params?.name ?? "");
      const w = WERKZEUGE[name];
      if (!w) return { isError: true, content: [{ type: "text", text: `Unbekanntes Werkzeug ${name}` }] };
      try {
        const r = await w.aus(a.params?.arguments ?? {});
        return { content: [{ type: "text", text: r.text }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Fehler: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
    default:
      throw Object.assign(new Error(`Methode ${a.method} unbekannt`), { code: -32601 });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (zeile) => {
  let a: Anfrage;
  try { a = JSON.parse(zeile); } catch { return; }
  if (a.id === undefined) return; // Benachrichtigungen brauchen keine Antwort
  bearbeite(a)
    .then((result) => sende({ jsonrpc: "2.0", id: a.id, result }))
    .catch((e: { message?: string; code?: number }) => sende({ jsonrpc: "2.0", id: a.id, error: { code: e.code ?? -32603, message: e.message ?? "Fehler" } }));
});
