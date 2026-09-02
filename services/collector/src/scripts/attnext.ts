/** Probe: does the attendance calendar's NEXT-month postback navigate? (prev-month is clamped at school-year start). */
import "../boot.js";
import * as cheerio from "cheerio";
import { HAC_PATHS, HacClient } from "../adapters/hac/client.js";
import { postbackFields } from "../adapters/hac/parse.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const month = (html: string) => cheerio.load(html)("#plnMain_cldAttendance .sg-asp-calendar-header td[align=center]").text().trim();
const html = await c.get(HAC_PATHS.attendance);
const $ = cheerio.load(html);
const nav = (title: string) => ($(`#plnMain_cldAttendance a[title='${title}']`).attr("href") ?? "").match(/__doPostBack\('([^']+)',\s*'([^']+)'\)/);
const next = nav("Go to the next month"), prev = nav("Go to the previous month");
console.log("current:", month(html), "| prev arg:", prev?.[2], "| next arg:", next?.[2]);
if (next) {
  const h2 = await c.post(HAC_PATHS.attendance, { ...postbackFields(html), __EVENTTARGET: next[1]!, __EVENTARGUMENT: next[2]! });
  console.log("after next postback:", month(h2), "| anchors:", cheerio.load(h2)("#plnMain_cldAttendance a[title]").map((_, a) => `${cheerio.load(h2)(a).attr("title")}=${(cheerio.load(h2)(a).attr("href") ?? "").match(/'(V\d+)'/)?.[1]}`).get().join(", "));
}
