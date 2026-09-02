import "../boot.js";
import { HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const js = await c.get("/HomeAccess/Scripts/Common/SunGard.Hac.SharedClasswork.js");
for (const key of ["openAssignmentDialog = function", "function openAssignmentDialog", "openAssignmentDialog=", ".aspx", "url:", "Url"]) {
  let i = -1, n = 0;
  while ((i = js.indexOf(key, i + 1)) >= 0 && n++ < 3) console.log(`=== ${key}: ` + js.slice(Math.max(0, i - 150), i + 450).replace(/\s+/g, " "));
}
