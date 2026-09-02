/** Smoke test for the subscription token: CLAUDE_CODE_OAUTH_TOKEN=... pnpm exec tsx src/scripts/claude-ping.ts */
import "../boot.js";
import { query } from "@anthropic-ai/claude-agent-sdk";
let text = "";
for await (const m of query({ prompt: "Reply with exactly: pong", options: { model: "claude-sonnet-5", maxTurns: 1, allowedTools: [] } })) {
  if (m.type === "result") text = "result" in m ? String(m.result) : JSON.stringify(m).slice(0, 200);
}
console.log(text.trim() || "(no result)");
