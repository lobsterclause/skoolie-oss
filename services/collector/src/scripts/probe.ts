import "../boot.js";
import * as cheerio from "cheerio";
import { writeFileSync } from "node:fs";
import { HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
for (const p of process.argv.slice(2)) {
  const html = await c.get(p);
  const name = p.replace(/[^a-z0-9]+/gi, "_").slice(-60);
  writeFileSync(`fixtures/raw/probe-${name}.html`, html);
  const $ = cheerio.load(html);
  console.log(`=== ${p} bytes=${html.length}`);
  $("table.sg-asp-table, table[id]").slice(0, 6).each((_, t) => {
    const hdr = $(t).find("tr").first().children("td,th").map((_, x) => $(x).text().replace(/\s+/g, " ").trim()).get().join(" | ");
    console.log(`  table#${$(t).attr("id") ?? "-"} rows=${$(t).find("tr").length}: ${hdr.slice(0, 160)}`);
  });
  console.log("  ids:", [...new Set($("[id^=plnMain_]").map((_, e) => $(e).attr("id")).get())].slice(0, 25).join(", "));
}
