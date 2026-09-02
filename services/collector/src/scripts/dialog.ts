import "../boot.js";
import * as cheerio from "cheerio";
import { writeFileSync } from "node:fs";
import { HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const frame = await c.get("/HomeAccess/Classes/Classwork");
const token = cheerio.load(frame)('input[name="__RequestVerificationToken"]').attr("value") ?? "";
console.log("token?", token.length > 0);
const html = await c.post("/HomeAccess/Classes/_AssignmentDialog", {
  assignmentNumber: "2",
  "key[CourseKey][SectionKey]": "2387519",
  "key[CourseKey][CourseSession]": "1",
  __RequestVerificationToken: token,
});
writeFileSync("fixtures/raw/probe-assignment-dialog.html", html);
const $ = cheerio.load(html);
console.log("bytes", html.length, "| title:", $("title").text().trim());
console.log($("body").text().replace(/\s+/g, " ").trim().slice(0, 700));
console.log("ids:", [...new Set($("[id]").map((_, e) => $(e).attr("id")).get())].slice(0, 30).join(", "));
console.log("links:", $("a[href]").map((_, a) => $(a).attr("href")).get().slice(0, 8));
