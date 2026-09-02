import { describe, expect, it } from "vitest";
import { CookieJar } from "./cookies.js";
import { HAC_PATHS, HacAuthError, HacClient, HacPageError, isHacErrorPage } from "./client.js";

function res(status: number, body = "", headers: Record<string, string | string[]> = {}): Response {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) for (const x of Array.isArray(v) ? v : [v]) h.append(k, x);
  return new Response(status >= 300 && status < 400 ? null : body, { status, headers: h });
}

const logonPage = `<form><input name="__RequestVerificationToken" value="tok" /><input name="Database" value="10" />
<input type="hidden" name="SCKTY00328510CustomEnabled" value="False" /><input id="LogOnDetails_Password" /></form>`;

describe("CookieJar", () => {
  it("absorbs, overwrites and deletes cookies", () => {
    const jar = new CookieJar();
    jar.absorb(res(200, "", { "set-cookie": ["a=1; Path=/", "b=2; HttpOnly"] }));
    expect(jar.header()).toBe("a=1; b=2");
    jar.absorb(res(200, "", { "set-cookie": ["a=3", "b=; expires=Thu, 01 Jan 1970 00:00:00 GMT"] }));
    expect(jar.header()).toBe("a=3");
  });
});

describe("HacClient", () => {
  it("logs in with the anti-forgery token, keeps 302 cookies, then fetches", async () => {
    const calls: Array<{ url: string; method: string; cookie: string; body?: string }> = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, method: init?.method ?? "GET", cookie: headers.get("cookie") ?? "", ...(init?.body ? { body: String(init.body) } : {}) });
      if (url.endsWith(HAC_PATHS.logon) && calls.length === 1) return res(200, logonPage, { "set-cookie": "__RequestVerificationToken=c1" });
      if (url.endsWith(HAC_PATHS.logon) && init?.method === "POST") return res(302, "", { location: "/HomeAccess/Classes/Classwork", "set-cookie": ".AuthCookie=auth1" });
      if (url.endsWith("/HomeAccess/Classes/Classwork")) return res(200, "<html>home</html>");
      if (url.endsWith(HAC_PATHS.registration)) return res(200, "<span id='plnMain_lblRegStudentName'>Kid</span>");
      return res(404);
    }) as typeof fetch;
    const c = new HacClient("https://hac.example.org", "user", "pw", { fetchImpl, minGapMs: 0, maxGapMs: 0 });
    const html = await c.get(HAC_PATHS.registration);
    expect(html).toContain("Kid");
    const post = calls.find((x) => x.method === "POST")!;
    expect(post.body).toContain("__RequestVerificationToken=tok");
    expect(post.body).toContain("LogOnDetails.UserName=user");
    expect(post.body).toContain("SCKTY00328510CustomEnabled=False");
    expect(calls.at(-1)!.cookie).toContain(".AuthCookie=auth1");
  });

  it("raises HacAuthError when the POST lands back on the logon page", async () => {
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (init?.method === "POST") return res(200, `<div class="validation-summary-errors">Invalid password</div>${logonPage}`);
      return res(200, logonPage);
    }) as typeof fetch;
    const c = new HacClient("https://hac.example.org", "user", "pw", { fetchImpl, minGapMs: 0, maxGapMs: 0 });
    await expect(c.get(HAC_PATHS.registration)).rejects.toThrow(HacAuthError);
    await expect(c.get(HAC_PATHS.registration)).rejects.toThrow(/Invalid password/);
  });
});

describe("HAC error page handling", () => {
  const errorPage = `<html><head><title>Error</title></head><body><div class="sg-error"><h2>Error</h2><p>An error occurred while processing your request.</p></div></body></html>`;
  it("recognizes the generic error page by body and by /Error/ url, but not real pages", () => {
    expect(isHacErrorPage("/HomeAccess/Content/Student/Assignments.aspx", errorPage)).toBe(true);
    expect(isHacErrorPage("/HomeAccess/Error/HttpError?aspxerrorpath=/x", "<html>whatever</html>")).toBe(true);
    expect(isHacErrorPage("/HomeAccess/Content/Student/Assignments.aspx", `<html><head><title>HomeAccess</title></head><table class="sg-asp-table"></table><script>var m="An error occurred while processing your request."</script></html>`)).toBe(false);
    expect(isHacErrorPage("/HomeAccess/Scripts/x.js", `function f(){ alert("An error occurred while processing your request."); }`)).toBe(false);
  });
  it("re-logs in and retries once, then throws HacPageError", async () => {
    let assignmentsHits = 0;
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return res(302, "", { location: "/HomeAccess/Classes/Classwork" });
      if (url.endsWith(HAC_PATHS.logon)) return res(200, logonPage);
      if (url.endsWith("/HomeAccess/Classes/Classwork")) return res(200, "<html>home</html>");
      if (url.endsWith(HAC_PATHS.assignments)) { assignmentsHits++; return res(200, errorPage); }
      return res(404);
    }) as typeof fetch;
    const c = new HacClient("https://hac.example.org", "user", "pw", { fetchImpl, minGapMs: 0, maxGapMs: 0 });
    await expect(c.get(HAC_PATHS.assignments)).rejects.toThrow(HacPageError);
    expect(assignmentsHits).toBe(2);
  });
});

describe("session persistence", () => {
  it("reuses cookies from the session file and skips login when the page is served", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const file = join(mkdtempSync(join(tmpdir(), "skoolie-")), "hac-session.json");
    let logins = 0;
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      const cookie = new Headers(init?.headers).get("cookie") ?? "";
      if (init?.method === "POST") { logins++; return res(302, "", { location: "/HomeAccess/Classes/Classwork", "set-cookie": ".AuthCookie=auth1" }); }
      if (url.endsWith(HAC_PATHS.logon)) return res(200, logonPage);
      if (url.endsWith("/HomeAccess/Classes/Classwork")) return res(200, "<html>home</html>");
      if (url.endsWith(HAC_PATHS.registration)) return cookie.includes(".AuthCookie=auth1") ? res(200, "<span id='plnMain_lblRegStudentName'>Kid</span>") : res(302, "", { location: HAC_PATHS.logon });
      return res(404);
    }) as typeof fetch;
    const a = new HacClient("https://hac.example.org", "user", "pw", { fetchImpl, sessionFile: file, minGapMs: 0, maxGapMs: 0 });
    await a.get(HAC_PATHS.registration);
    expect(logins).toBe(1);
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ ".AuthCookie": "auth1" });
    const b = new HacClient("https://hac.example.org", "user", "pw", { fetchImpl, sessionFile: file, minGapMs: 0, maxGapMs: 0 });
    await b.get(HAC_PATHS.registration);
    expect(logins).toBe(1); // second client rode the cached session
    expect(b.loginCount).toBe(0);
  });
});
