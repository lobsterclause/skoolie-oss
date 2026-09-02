import * as cheerio from "cheerio";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CookieJar } from "./cookies.js";

export const HAC_PATHS = {
  logon: "/HomeAccess/Account/LogOn",
  registration: "/HomeAccess/Content/Student/Registration.aspx",
  assignments: "/HomeAccess/Content/Student/Assignments.aspx",
  classes: "/HomeAccess/Content/Student/Classes.aspx",
  attendance: "/HomeAccess/Content/Attendance/MonthlyView.aspx",
  testScores: "/HomeAccess/Content/Student/TestScores.aspx",
  classworkFrame: "/HomeAccess/Classes/Classwork",
  assignmentDialog: "/HomeAccess/Classes/_AssignmentDialog",
  weekView: "/HomeAccess/Home/WeekView",
  studentPicker: "/HomeAccess/Frame/StudentPicker",
} as const;

export class HacAuthError extends Error {}
/** HAC answered with its generic error page ("An error occurred while processing your request."). */
export class HacPageError extends Error {}

export function isHacErrorPage(url: string, body: string): boolean {
  if (/\/HomeAccess\/Error\//i.test(url)) return true;
  // HAC's error/not-found pages carry <title>Error</title>. Do NOT match on the message text: it also
  // lives inside HAC's own JS bundles (SungardCommon.js), which would trigger a bogus re-login.
  return /<title>\s*Error\s*<\/title>/i.test(body) && /An error occurred while processing your request|Error/i.test(body);
}

export interface HacHttp {
  get(path: string): Promise<string>;
  post(path: string, form: Record<string, string>): Promise<string>;
}

/**
 * Thin HTTP session against eSchoolPLUS Home Access Center. HAC is server-rendered ASP.NET MVC,
 * so no browser is needed: log in with the anti-forgery token from the logon page, keep the
 * session cookies, and re-login automatically when a GET bounces back to /Account/LogOn.
 */
export interface HacClientOptions {
  /** Persist session cookies here so consecutive runs reuse one HAC session instead of logging in each time. */
  sessionFile?: string;
  fetchImpl?: typeof fetch;
  /** Gap between requests, ms. A random value in [minGapMs, maxGapMs] per request: HAC degrades under bursts and a fixed cadence is a bot signature. */
  minGapMs?: number;
  maxGapMs?: number;
  /** Browser-like User-Agent. */
  userAgent?: string;
}

export const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

export class HacClient implements HacHttp {
  private readonly jar = new CookieJar();
  private loggedIn = false;
  private readonly fetchImpl: typeof fetch;
  private readonly sessionFile: string | undefined;
  private readonly minGapMs: number;
  private readonly maxGapMs: number;
  private readonly userAgent: string;
  private lastRequestAt = 0;
  loginCount = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    opts: HacClientOptions | typeof fetch = {},
  ) {
    const o: HacClientOptions = typeof opts === "function" ? { fetchImpl: opts } : opts;
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sessionFile = o.sessionFile;
    this.minGapMs = o.minGapMs ?? 400;
    this.maxGapMs = Math.max(this.minGapMs, o.maxGapMs ?? 1800);
    this.userAgent = o.userAgent ?? DEFAULT_UA;
    if (this.sessionFile) {
      try {
        this.jar.load(JSON.parse(readFileSync(this.sessionFile, "utf8")) as Record<string, string>);
        this.loggedIn = this.jar.size > 0; // optimistic: a bounce to /Account/LogOn re-logs in
      } catch {
        /* no cached session */
      }
    }
  }

  private saveSession(): void {
    if (!this.sessionFile) return;
    try {
      mkdirSync(path.dirname(this.sessionFile), { recursive: true });
      writeFileSync(this.sessionFile, JSON.stringify(this.jar.toJSON()), { mode: 0o600 });
    } catch {
      /* best effort */
    }
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const gap = this.minGapMs + Math.random() * (this.maxGapMs - this.minGapMs);
    const wait = this.lastRequestAt + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    const res = await this.fetchImpl(new URL(path, this.baseUrl), {
      ...init,
      redirect: "manual",
      headers: {
        "user-agent": this.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        cookie: this.jar.header(),
        ...(init.headers ?? {}),
      },
    });
    this.jar.absorb(res);
    return res;
  }

  /** Follows same-host redirects by hand so cookies set on 302 responses are kept. */
  private async follow(path: string, init: RequestInit = {}, hops = 5): Promise<{ res: Response; url: string }> {
    let current = path;
    let res = await this.raw(current, init);
    while (res.status >= 300 && res.status < 400 && hops-- > 0) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, new URL(current, this.baseUrl));
      current = next.pathname + next.search;
      res = await this.raw(current);
    }
    return { res, url: current };
  }

  async login(): Promise<void> {
    // A fresh session every time: HAC rejects a second login on cookies that are already authenticated.
    this.jar.clear();
    this.loggedIn = false;
    const { res: page } = await this.follow(HAC_PATHS.logon);
    const $ = cheerio.load(await page.text());
    const token = $('input[name="__RequestVerificationToken"]').attr("value");
    if (!token) throw new HacAuthError("Logon page had no __RequestVerificationToken (layout changed?)");
    const form: Record<string, string> = {
      __RequestVerificationToken: token,
      Database: $('input[name="Database"]').attr("value") ?? "10",
      VerificationOption: "UsernamePassword",
      "LogOnDetails.UserName": this.username,
      "LogOnDetails.Password": this.password,
      tempUN: "",
      tempPW: "",
    };
    for (const el of $('input[type="hidden"][name$="CustomEnabled"]').toArray()) {
      const name = $(el).attr("name");
      if (name) form[name] = $(el).attr("value") ?? "False";
    }
    const { res, url } = await this.follow(HAC_PATHS.logon, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
    const body = await res.text();
    if (url.includes("/Account/LogOn") || /LogOnDetails_Password/.test(body)) {
      const msg = cheerio.load(body)(".validation-summary-errors, #LoginErrorMessage").text().trim();
      throw new HacAuthError(`HAC login failed${msg ? `: ${msg}` : ""}`);
    }
    this.loggedIn = true;
    this.loginCount++;
    this.saveSession();
  }

  async get(path: string): Promise<string> {
    if (!this.loggedIn) await this.login();
    let { res, url } = await this.follow(path);
    if (url.includes("/Account/LogOn")) {
      this.loggedIn = false;
      await this.login();
      ({ res, url } = await this.follow(path));
      if (url.includes("/Account/LogOn")) throw new HacAuthError(`Still redirected to logon for ${path}`);
    }
    let body = await res.text();
    if (isHacErrorPage(url, body)) {
      // HAC's error page usually means a dead session or a transient server hiccup: re-login, retry once.
      this.loggedIn = false;
      await this.login();
      ({ res, url } = await this.follow(path));
      body = await res.text();
      if (isHacErrorPage(url, body)) throw new HacPageError(`HAC error page for ${path} (after re-login)`);
    }
    if (!res.ok) throw new Error(`HAC GET ${path} -> ${res.status}`);
    return body;
  }

  async post(path: string, form: Record<string, string>): Promise<string> {
    if (!this.loggedIn) await this.login();
    const { res } = await this.follow(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
    const body = await res.text();
    if (isHacErrorPage(path, body)) throw new HacPageError(`HAC error page for POST ${path}`);
    if (!res.ok) throw new Error(`HAC POST ${path} -> ${res.status}`);
    return body;
  }
}
