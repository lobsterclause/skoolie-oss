import "../boot.js";
import * as cheerio from "cheerio";
import { HAC_PATHS, HacClient } from "../adapters/hac/client.js";
const c = new HacClient(process.env.HAC_BASE_URL!, process.env.HAC_USERNAME!, process.env.HAC_PASSWORD!, { sessionFile: process.env.SKOOLIE_SESSION_FILE ?? "./browser-data/hac-session.json" });
const $ = cheerio.load(await c.get(HAC_PATHS.attendance));
console.log($("body").text().replace(/\s+/g, " ").trim().slice(0, 400));
