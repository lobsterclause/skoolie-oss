import "../boot.js";
import { HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
for (const p of process.argv.slice(2)) {
  const js = await c.get(p);
  for (const name of ["OpenAssignmentPopUp", "OpenClassPopUp"]) {
    const i = js.indexOf("function " + name);
    if (i >= 0) console.log(`=== ${name} in ${p}\n` + js.slice(i, i + 700).replace(/\s+/g, " "));
  }
}
