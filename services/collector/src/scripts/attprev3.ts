import "../boot.js";
import * as cheerio from "cheerio";
import { HAC_PATHS, HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const show = (label: string, html: string) => { const $ = cheerio.load(html); console.log(label, "| title:", $("title").text().trim(), "| form:", $("form").attr("action"), "| cal:", $("#plnMain_cldAttendance").length, "| anchors:", $("#plnMain_cldAttendance a").length); };
show("attendance first", await c.get(HAC_PATHS.attendance));
await c.get(HAC_PATHS.registration);
show("attendance after registration", await c.get(HAC_PATHS.attendance));
