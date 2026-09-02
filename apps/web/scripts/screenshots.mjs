#!/usr/bin/env node
/**
 * Visual gate: build the app in demo mode, serve it, and screenshot every route at phone (390×844)
 * and desktop (1280×900) in light and dark. Fails on any page error or horizontal overflow.
 *
 *   pnpm --filter @skoolie/web shots            # writes apps/web/shots/*.png (gitignored)
 *   pnpm --filter @skoolie/web shots -- --no-build   # reuse dist-demo
 *
 * Needs a Chromium: `pnpm exec playwright install chromium` once.
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "shots");
const port = 4173;
const args = process.argv.slice(2);

if (!args.includes("--no-build")) {
  const r = spawnSync("pnpm", ["exec", "vite", "build", "--outDir", "dist-demo"], { cwd: root, stdio: "inherit", env: { ...process.env, VITE_DEMO: "1" } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const server = spawn("pnpm", ["exec", "vite", "preview", "--outDir", "dist-demo", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
await new Promise((resolve, reject) => {
  const started = Date.now();
  const tick = async () => {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return resolve();
    } catch {}
    if (Date.now() - started > 20000) return reject(new Error("preview server did not start"));
    setTimeout(tick, 250);
  };
  tick();
});

const routes = [
  ["home", "/s/robin"],
  ["assignments", "/s/robin/assignments"],
  ["assignment", "/s/robin/assignments/a1"],
  ["grades", "/s/robin/grades"],
  ["course", "/s/robin/grades/math-7"],
  ["attendance", "/s/robin/attendance"],
  ["tests", "/s/robin/tests"],
  ["calendar", "/s/robin/calendar"],
  ["teachers", "/s/robin/teachers"],
  ["teacher", "/s/robin/teachers/priya_ramesh%40example-isd.org"],
  ["activity", "/activity"],
  ["messages", "/messages"],
  ["message", "/messages/m1"],
  ["status", "/status"],
  ["settings", "/settings"],
  ["family", "/?all"],
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const errors = [];
let browser;
try {
browser = await chromium.launch();
for (const [scheme, dark] of [["light", false], ["dark", true]]) {
  for (const [name, w, h] of [["phone", 390, 844], ["desktop", 1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light", deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${name}/${scheme}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}/${scheme} console: ${m.text().slice(0, 200)}`); });
    for (const [key, path] of routes) {
      await page.goto(`http://localhost:${port}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) errors.push(`${name}/${scheme}/${key}: horizontal overflow`);
      await page.screenshot({ path: join(out, `${key}-${name}-${scheme}.png`), fullPage: name === "phone" });
    }
    await ctx.close();
  }
}
} finally {
  // Whatever threw above, never leave the preview server holding the port.
  await browser?.close().catch(() => {});
  server.kill();
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — ${routes.length * 4} screenshots in ${out}, no page errors, no horizontal overflow`);
