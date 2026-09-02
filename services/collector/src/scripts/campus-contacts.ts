/** Stagehand (local Chromium, no LLM needed): load JS-rendered campus pages and pull emails/phones. */
import "../boot.js";
import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
import { writeFileSync } from "node:fs";
import { z } from "zod";
const urls = process.argv.slice(2);
const browser = await localBrowser.launch({ headless: true, viewport: { width: 1280, height: 900 } });
// No LLM calls in this script; the model entry only satisfies the constructor.
const hasModel = Boolean(process.env.GOOGLE_API_KEY);
const stagehand = await Stagehand.create({ browser, model: { modelName: "google/gemini-3-flash-preview", apiKey: process.env.GOOGLE_API_KEY ?? "unused" }, logging: { level: "error" } });
try {
  const page = (await browser.context.pages())[0]!;
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);
      const html = (await page.evaluate("document.documentElement.outerHTML")) as string;
      const text = (await page.evaluate("document.body.innerText")) as string;
      writeFileSync(`fixtures/raw/campus-${url.replace(/[^a-z0-9]+/gi, "_").slice(-50)}.html`, html);
      const emails = [...new Set(html.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [])].filter((e) => !/png|jpg|svg|example|sentry/i.test(e));
      const phones = [...new Set(text.match(/\(?512\)?[ -]?\d{3}-\d{4}/g) ?? [])];
      console.log(`=== ${url}\n title: ${await page.title()} | bytes ${html.length}\n emails: ${emails.slice(0, 40).join(", ")}\n phones: ${phones.slice(0, 8).join(", ")}`);
      for (const line of text.split("\n")) if (/counsel|principal|attendance|registrar|nurse|front office|main office/i.test(line)) console.log("  |", line.trim().slice(0, 140));
      if (hasModel) {
        const { data } = await stagehand.extract(
          "Extract every school contact on this page: role/title, person name, email address, phone number. Include the main/front office, attendance line, counselors, nurse, registrar, principal.",
          z.object({ contacts: z.array(z.object({ role: z.string(), name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() })) }),
          { page },
        );
        console.log(" extracted:", JSON.stringify(data.contacts));
      }
    } catch (e) {
      console.log(`=== ${url}\n error: ${(e as Error).message.slice(0, 200)}`);
    }
  }
} finally {
  await stagehand.close();
}
