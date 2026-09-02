/** Search the Graph mailbox: mail-search.ts "<search terms>" [days] — prints date | from | subject | urls matching a pattern. */
import "../boot.js";
import { loadEnv } from "../config.js";
import { graphToken } from "../links/graph.js";
import { findUrls } from "../links/extract.js";
const env = loadEnv();
const q = process.argv[2] ?? "classroom";
const days = Number(process.argv[3] ?? 365);
const urlRe = new RegExp(process.argv[4] ?? "classroom\\.google\\.com|canva\\.com", "i");
const token = await graphToken({ clientId: env.SKOOLIE_GRAPH_CLIENT_ID!, tenantId: env.SKOOLIE_GRAPH_TENANT_ID, cachePath: env.SKOOLIE_GRAPH_TOKEN_CACHE, days, fromDomains: [] });
const since = new Date(Date.now() - days * 86_400_000).toISOString();
let url: string | undefined = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(q)}"&$top=50&$select=id,subject,receivedDateTime,from,body,webLink`;
let n = 0;
while (url && n < 200) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const page = (await res.json()) as { value: Array<{ id: string; subject?: string; receivedDateTime: string; from?: { emailAddress?: { address?: string; name?: string } }; body?: { content?: string; contentType?: string } }>; "@odata.nextLink"?: string };
  for (const m of page.value) {
    if (m.receivedDateTime < since) continue;
    n++;
    const body = m.body?.content ?? "";
    const urls = findUrls({ from: "", subject: "", date: "", ...(m.body?.contentType?.toLowerCase() === "html" ? { html: body } : { text: body }) }).map((u) => u.url).filter((u) => urlRe.test(u));
    console.log(`${m.receivedDateTime.slice(0, 10)} | ${m.from?.emailAddress?.address ?? "?"} | ${(m.subject ?? "").slice(0, 90)}${urls.length ? `\n    ${[...new Set(urls)].slice(0, 4).join("\n    ")}` : ""}`);
  }
  url = page["@odata.nextLink"];
}
console.error(`${n} messages matched "${q}" in ${days}d`);
