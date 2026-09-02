import "../boot.js";
import * as cheerio from "cheerio";
import { HAC_PATHS, HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const html = await c.get(HAC_PATHS.attendance);
const $ = cheerio.load(html);
$("#plnMain_cldAttendance a").slice(0, 4).each((_, a) => console.log("anchor:", JSON.stringify($(a).attr()), "text:", $(a).text().trim()));
console.log("form:", $("form").attr("action"), "| hidden:", $("input[type=hidden]").map((_, i) => $(i).attr("name")).get().join(","));
