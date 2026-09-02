import "../boot.js";
import { HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const js = await c.get("/HomeAccess/Scripts/Common/SunGard.Hac.SharedClasswork.js");
const i = js.indexOf("openAssignmentDialog = function");
console.log(js.slice(i, i + 2500).replace(/\/\/\/[^\n]*/g, "").replace(/\s+/g, " "));
