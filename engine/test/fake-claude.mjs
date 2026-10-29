#!/usr/bin/env node
// Spielt Claude Code im stream-json-Format nach, für Tests ohne Abo.
let prompt = "";
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", () => {
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  const args = process.argv.slice(2);
  out({ type: "system", subtype: "init", session_id: args.includes("--resume") ? args[args.indexOf("--resume") + 1] : args[args.indexOf("--session-id") + 1] });
  out({ type: "assistant", message: { content: [{ type: "text", text: "Ich schaue nach." }, { type: "tool_use", name: "mcp__zentrale__stand", input: {} }] } });
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__zentrale__buchungen", input: { seit: "2026-10-26" } }] } });
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/x/_Wissen/wissensregister.json" } }] } });
  if (prompt.includes("kaputt")) process.exit(3);
  out({ type: "result", subtype: "success", is_error: false, result: `Antwort auf: ${prompt} | args: ${args.includes("--restricted") && args.includes("dontAsk") && !args.join(" ").includes("Bash") ? "sicher" : "UNSICHER"}`, session_id: args.includes("--resume") ? "fortgesetzt" : "neu" });
});
