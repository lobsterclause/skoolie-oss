/**
 * Render a Canva "view" link in a real browser and pull the text of every page.
 * @no-env — takes its URL on argv and reads no configuration, so it needs no .env.
 */
import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
const url = process.argv[2]!;
const browser = await localBrowser.launch({ headless: true, viewport: { width: 1280, height: 900 } });
const stagehand = await Stagehand.create({ browser, model: { modelName: "google/gemini-3-flash-preview", apiKey: "unused" }, logging: { level: "error" } });
try {
  const page = (await browser.context.pages())[0]!;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  const info = (await page.evaluate(`(() => {
    const t = document.body.innerText;
    const pages = document.querySelectorAll('[aria-label*="Page"], [data-page], .page').length;
    return { textLen: t.length, head: t.slice(0, 1500), pages, title: document.title };
  })()`)) as { textLen: number; head: string; pages: number; title: string };
  console.log(JSON.stringify(info, null, 2));
  // Walk pages with the viewer's "Next page" button, collecting the page text each time.
  const seen: string[] = [];
  const strip = (t: string) => t.replace(/^Canva[\s\S]*?Create with Canva\n/, "").replace(/\n\d+\n\n\/\n\n\d+\n[\s\S]*$/, "").trim();
  const pageText = async () => strip((await page.evaluate("document.body.innerText")) as string);
  for (let i = 0; i < 40; i++) {
    const txt = await pageText();
    if (seen.length === 0 || seen[seen.length - 1] !== txt) seen.push(txt);
    const clicked = (await page.evaluate(`(() => { const b = document.querySelector('[aria-label="Next page"]'); if (!b || b.disabled || b.getAttribute("aria-disabled") === "true") return false; b.click(); return true; })()`)) as boolean;
    if (!clicked) break;
    await page.waitForTimeout(900);
  }
  console.log("distinct page texts:", seen.length, "| total chars:", seen.reduce((n, s) => n + s.length, 0));
  console.log(seen.map((s, i) => `--- page ${i + 1} ---\n${s.slice(0, 500)}`).join("\n"));
} finally {
  await stagehand.close();
}
