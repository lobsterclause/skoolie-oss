import "../boot.js";
import * as cheerio from "cheerio";
import { HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const seen = new Map<string, string>();
for (const p of ["/HomeAccess/Classes/Classwork", "/HomeAccess/Home/WeekView", "/HomeAccess/Frame/StudentPicker"]) {
  try {
    const $ = cheerio.load(await c.get(p));
    $("a[href^='/HomeAccess/'], iframe[src^='/HomeAccess/']").each((_, el) => {
      const href = ($(el).attr("href") ?? $(el).attr("src") ?? "").split("?")[0]!;
      const text = $(el).text().replace(/\s+/g, " ").trim() || $(el).attr("title") || "";
      if (!/Scripts|Stylesheets|Media|Resource/.test(href)) seen.set(href, text);
    });
    console.log(`[ok] ${p}`);
  } catch (e) { console.log(`[err] ${p}: ${(e as Error).message}`); }
}
for (const p of ["/HomeAccess/Content/Student/ReportCards.aspx", "/HomeAccess/Content/Student/InterimProgress.aspx", "/HomeAccess/Content/Student/Transcript.aspx",
  "/HomeAccess/Content/Student/TestScores.aspx", "/HomeAccess/Content/Student/Discipline.aspx", "/HomeAccess/Content/Student/Requests.aspx",
  "/HomeAccess/Content/Student/Immunizations.aspx", "/HomeAccess/Content/Student/Fees.aspx", "/HomeAccess/Content/Student/Transportation.aspx",
  "/HomeAccess/Content/Student/StudentSummary.aspx", "/HomeAccess/Content/Attendance/MonthlyView.aspx", "/HomeAccess/Content/Student/Classes.aspx",
  "/HomeAccess/Content/Student/Registration.aspx", "/HomeAccess/Content/Student/Assignments.aspx", "/HomeAccess/Home/Calendar", "/HomeAccess/Content/Student/Emergency.aspx",
  "/HomeAccess/Content/Student/Contacts.aspx", "/HomeAccess/Content/Student/Notifications.aspx", "/HomeAccess/Content/Student/Alerts.aspx", "/HomeAccess/Content/Attendance/AttendanceDetails.aspx"]) {
  try {
    const html = await c.get(p);
    const $ = cheerio.load(html);
    const title = $("title").text().trim() || $("h1,h2,.sg-content-title").first().text().replace(/\s+/g, " ").trim();
    const tables = $("table.sg-asp-table, table.sg-asp-calendar").length;
    const isErr = /HttpError|NotFound|An error occurred/i.test(html) && html.length < 8000;
    console.log(`${isErr ? "[missing]" : "[page]   "} ${p}  tables=${tables} title="${title.slice(0, 50)}" bytes=${html.length}`);
  } catch (e) { console.log(`[err] ${p}: ${(e as Error).message.slice(0, 80)}`); }
}
console.log("--- nav links discovered:");
for (const [h, t] of [...seen].sort()) console.log(`${h}  ${t}`);
