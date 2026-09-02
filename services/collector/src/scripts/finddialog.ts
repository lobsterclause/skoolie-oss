import "../boot.js";
import * as cheerio from "cheerio";
import { HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const frame = await c.get("/HomeAccess/Classes/Classwork");
const $ = cheerio.load(frame);
const srcs = $("script[src]").map((_, s) => $(s).attr("src")!).get().filter((s) => !/jquery|modernizr|Trirand|json2/i.test(s));
console.log("scripts:", srcs.join("\n  "));
const bodies = [["(inline)", $("script:not([src])").map((_, s) => $(s).html() ?? "").get().join("\n")], ...await Promise.all(srcs.map(async (s) => [s, await c.get(new URL(s, "https://x/HomeAccess/Classes/").pathname + (s.includes("?") ? "?" + s.split("?")[1] : ""))] as const))];
for (const [name, js] of bodies) {
  for (const key of ["OpenAssignmentDialog", "AssignmentPopUp", "ClassworkAssignment", "Assignment.aspx", "GetAssignment"]) {
    let i = -1;
    while ((i = js.indexOf(key, i + 1)) >= 0 && i < js.length) {
      console.log(`=== ${key} @ ${name}: ` + js.slice(Math.max(0, i - 200), i + 500).replace(/\s+/g, " "));
      break;
    }
  }
}
