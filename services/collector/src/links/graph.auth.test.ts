import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICachePlugin } from "@azure/msal-node";
import { fetchSchoolMailGraph, graphLogin, graphToken, type GraphConfig } from "./graph.js";

const msal = vi.hoisted(() => ({
  configs: [] as Array<{ auth: { clientId: string; authority: string }; cache: { cachePlugin: ICachePlugin } }>,
  accounts: [] as Array<{ username: string }>,
  deviceCode: null as { account: { username: string } } | null,
  silent: null as { accessToken: string } | null,
  silentError: null as Error | null,
  deviceScopes: [] as string[][],
}));

vi.mock("@azure/msal-node", () => ({
  PublicClientApplication: class {
    constructor(config: (typeof msal.configs)[number]) {
      msal.configs.push(config);
    }
    async acquireTokenByDeviceCode(opts: { scopes: string[]; deviceCodeCallback: (i: { message: string }) => void }) {
      msal.deviceScopes.push(opts.scopes);
      opts.deviceCodeCallback({ message: "go to microsoft.com/devicelogin and enter ABC-DEF" });
      return msal.deviceCode;
    }
    getTokenCache() {
      return { getAllAccounts: async () => msal.accounts };
    }
    async acquireTokenSilent() {
      if (msal.silentError) throw msal.silentError;
      return msal.silent;
    }
  },
}));

const cfg: GraphConfig = { clientId: "client-1", tenantId: "organizations", cachePath: "/tmp/skoolie-test/msal.json", days: 14, fromDomains: ["example-isd.org"] };

beforeEach(() => {
  msal.configs = [];
  msal.accounts = [];
  msal.deviceCode = { account: { username: "parent@school.org" } };
  msal.silent = { accessToken: "tok-1" };
  msal.silentError = null;
  msal.deviceScopes = [];
});

describe("graphLogin", () => {
  it("signs in against the configured tenant and reports which account was cached", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await graphLogin(cfg)).toBe("parent@school.org");
      expect(msal.configs[0]!.auth).toEqual({ clientId: "client-1", authority: "https://login.microsoftonline.com/organizations" });
      expect(msal.deviceScopes[0]).toEqual(["Mail.Read", "User.Read", "offline_access"]); // read-only, plus a refresh token
      expect(log).toHaveBeenCalledWith(expect.stringContaining("microsoft.com/devicelogin"));
    } finally {
      log.mockRestore();
    }
  });

  it("fails when the device-code flow ends without an account", async () => {
    msal.deviceCode = null;
    await expect(graphLogin(cfg)).rejects.toThrow(/no account/);
  });
});

describe("graphToken", () => {
  it("refreshes silently from the cached account", async () => {
    msal.accounts = [{ username: "parent@school.org" }];
    expect(await graphToken(cfg)).toBe("tok-1");
  });

  it("tells the operator to sign in when there is nothing cached", async () => {
    await expect(graphToken(cfg)).rejects.toThrow(/no cached Microsoft account in \/tmp\/skoolie-test\/msal\.json; run: --adapter links --graph-login/);
  });

  it("says what the refresh failure was, and still points at the fix", async () => {
    msal.accounts = [{ username: "parent@school.org" }];
    msal.silentError = new Error("AADSTS700082: refresh token expired");
    await expect(graphToken(cfg)).rejects.toThrow(/token refresh failed \(AADSTS700082: refresh token expired\); run: --adapter links --graph-login/);
  });
});

describe("the token cache on disk", () => {
  const plugin = async () => {
    const dir = await mkdtemp(join(tmpdir(), "skoolie-msal-"));
    const path = join(dir, "nested", "msal.json");
    msal.accounts = [{ username: "parent@school.org" }];
    await graphToken({ ...cfg, cachePath: path });
    return { path, plugin: msal.configs[0]!.cache.cachePlugin };
  };

  it("hands back on the next run exactly what it wrote", async () => {
    const { plugin: p } = await plugin();
    const deserialize = vi.fn();
    await p.afterCacheAccess({ cacheHasChanged: true, tokenCache: { deserialize, serialize: () => '{"RefreshToken":{"a":1}}' } } as never);
    await p.beforeCacheAccess({ tokenCache: { deserialize, serialize: () => "" } } as never);
    expect(deserialize).toHaveBeenCalledWith('{"RefreshToken":{"a":1}}');
  });

  it("shrugs off a first run with no cache file yet", async () => {
    const { plugin: p } = await plugin();
    const deserialize = vi.fn();
    await expect(p.beforeCacheAccess({ tokenCache: { deserialize, serialize: () => "" } } as never)).resolves.toBeUndefined();
    expect(deserialize).not.toHaveBeenCalled();
  });

  it("writes the refresh token only when it changed, and only readable by its owner", async () => {
    const { path, plugin: p } = await plugin();
    await p.afterCacheAccess({ cacheHasChanged: false, tokenCache: { serialize: () => "unchanged" } } as never);
    await expect(readFile(path, "utf8")).rejects.toThrow(/ENOENT/);

    await p.afterCacheAccess({ cacheHasChanged: true, tokenCache: { serialize: () => "changed" } } as never);
    expect(await readFile(path, "utf8")).toBe("changed"); // the missing parent directory was created
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});

describe("fetchSchoolMailGraph windowing", () => {
  const reply = (value: unknown[]) => new Response(JSON.stringify({ value }), { status: 200 });

  it("asks only for mail inside the configured window, newest first", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-30T12:00:00Z"));
      let url = "";
      const fetchImpl = (async (u: string) => {
        url = u;
        return reply([]);
      }) as unknown as typeof fetch;
      const log: string[] = [];
      await fetchSchoolMailGraph({ ...cfg, days: 14, log: (m) => log.push(m) }, fetchImpl, "tok");
      expect(url).toContain("$filter=receivedDateTime ge 2026-08-16T12:00:00.000Z");
      expect(url).toContain("$orderby=receivedDateTime desc");
      expect(url).toContain("$select=id,subject,receivedDateTime,from,body");
      expect(log).toEqual(["graph: scanned 0 messages since 2026-08-16, 0 new from example-isd.org"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts what it scanned, not what it kept", async () => {
    const mail = (id: string, address: string) => ({ id, subject: id, receivedDateTime: "2026-08-20T00:00:00Z", from: { emailAddress: { address } }, body: { contentType: "text", content: "hi" } });
    const fetchImpl = (async () => reply([mail("a", "pta@gmail.com"), mail("b", "office@example-isd.org"), mail("c", "office@cvms.example-isd.org")])) as unknown as typeof fetch;
    const log: string[] = [];
    const out = await fetchSchoolMailGraph({ ...cfg, log: (m) => log.push(m) }, fetchImpl, "tok");
    expect(out.map((m) => m.id)).toEqual(["b", "c"]); // the subdomain counts as school mail; gmail does not
    expect(out[0]!.from).toBe("office@example-isd.org"); // no display name: the address stands in for it
    expect(log[0]).toContain("scanned 3 messages");
  });

  it("survives mail with no sender, no body and no display name", async () => {
    const fetchImpl = (async () => reply([{ id: "a", receivedDateTime: "2026-08-20T00:00:00Z" }, { id: "b", receivedDateTime: "2026-08-20T00:00:00Z", from: {}, body: {} }])) as unknown as typeof fetch;
    const out = await fetchSchoolMailGraph({ ...cfg, fromAddresses: [""] }, fetchImpl, "tok");
    expect(out.map((m) => [m.id, m.subject, m.text])).toEqual([["a", "", ""], ["b", "", ""]]);
  });

  it("keeps every message when the run has no seen-ids to compare against", async () => {
    const fetchImpl = (async () => reply([{ id: "a", receivedDateTime: "2026-08-20T00:00:00Z", from: { emailAddress: { address: "office@example-isd.org" } } }])) as unknown as typeof fetch;
    expect((await fetchSchoolMailGraph(cfg, fetchImpl, "tok")).map((m) => m.id)).toEqual(["a"]);
  });

  it("quotes the start of an error body, not all of it", async () => {
    const fetchImpl = (async () => new Response("x".repeat(500), { status: 500 })) as unknown as typeof fetch;
    await expect(fetchSchoolMailGraph(cfg, fetchImpl, "tok")).rejects.toThrow(new RegExp(`^graph 500: x{200}$`));
  });
});
