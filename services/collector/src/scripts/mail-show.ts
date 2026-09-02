/** mail-show.ts "<search>" — print text body (trimmed) and every URL of the newest matching messages. */
import "../boot.js";
import { load } from "cheerio";
import { loadEnv } from "../config.js";
import { graphToken } from "../links/graph.js";
import { findUrls } from "../links/extract.js";
const env = loadEnv();
const q = process.argv[2]!;
const max = Number(process.argv[3] ?? 2);
const token = await graphToken({ clientId: env.SKOOLIE_GRAPH_CLIENT_ID!, tenantId: env.SKOOLIE_GRAPH_TENANT_ID, cachePath: env.SKOOLIE_GRAPH_TOKEN_CACHE, days: 400, fromDomains: [] });
const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(q)}"&$top=${max}&$select=id,subject,receivedDateTime,from,body`, { headers: { Authorization: `Bearer ${token}` } });
const page = (await res.json()) as { value: Array<{ subject?: string; receivedDateTime: string; from?: { emailAddress?: { address?: string } }; body?: { content?: string; contentType?: string } }> };
for (const m of page.value) {
  const html = m.body?.contentType?.toLowerCase() === "html";
  const body = m.body?.content ?? "";
  const text = html ? load(body).text() : body;
  console.log(`\n##### ${m.receivedDateTime.slice(0, 10)} | ${m.from?.emailAddress?.address} | ${m.subject}`);
  console.log(text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3500));
  console.log("--- urls:");
  for (const u of findUrls({ from: "", subject: "", date: "", ...(html ? { html: body } : { text: body }) })) console.log(`  [${u.text.slice(0, 40)}] ${u.url}`);
}
