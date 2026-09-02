import { describe, expect, it } from "vitest";
import { fetchSchoolMailGraph } from "./graph.js";

const cfg = { clientId: "x", tenantId: "organizations", cachePath: "/nonexistent", days: 30, fromDomains: ["example-isd.org"], seenIds: new Set(["seen-1"]) };

const page = (value: unknown[], next?: string) => ({ value, ...(next ? { "@odata.nextLink": next } : {}) });
const msg = (id: string, address: string, html = true) => ({
  id,
  subject: `subj ${id}`,
  receivedDateTime: "2026-08-20T20:04:05Z",
  from: { emailAddress: { name: "Teacher", address } },
  body: { contentType: html ? "html" : "text", content: html ? "<p>hi</p>" : "hi" },
});

describe("fetchSchoolMailGraph", () => {
  it("follows paging, keeps only school senders, skips seen ids, maps html/text bodies", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      expect((init?.headers as Record<string, string>).Prefer).toContain('IdType="ImmutableId"');
      const body = url.includes("page2")
        ? page([msg("c", "Alice_B@example-isd.org", false)])
        : page([msg("a", "pta@gmail.com"), msg("seen-1", "x@example-isd.org"), msg("b", "Bob_C@EXAMPLE-ISD.org")], "https://graph.microsoft.com/page2");
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await fetchSchoolMailGraph(cfg, fetchImpl, "tok");
    expect(calls).toHaveLength(2);
    expect(out.map((m) => m.id)).toEqual(["b", "c"]);
    expect(out[0]).toMatchObject({ from: "Teacher <bob_c@example-isd.org>", subject: "subj b", html: "<p>hi</p>" });
    expect(out[1]).toMatchObject({ text: "hi" });
  });
  it("accepts exact extra addresses (a forwarding parent) besides the domains", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(page([msg("f", "other-parent@example.com"), msg("x", "pta@gmail.com")])), { status: 200 })) as unknown as typeof fetch;
    const out = await fetchSchoolMailGraph({ ...cfg, fromAddresses: ["Other-Parent@example.com"] }, fetchImpl, "tok");
    expect(out.map((m) => m.id)).toEqual(["f"]);
  });
  it("surfaces graph errors", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchSchoolMailGraph(cfg, fetchImpl, "tok")).rejects.toThrow(/graph 401/);
  });
});
