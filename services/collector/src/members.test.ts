import { describe, expect, it } from "vitest";
import { memberDoc, planMemberReconcile, removeProcessed, type PendingMember } from "./members.js";

const pending = (email: string, role: PendingMember["role"] = "parent"): PendingMember => ({ email, role, studentIds: ["primary"] });
const uids: Record<string, string> = { "parent@x.com": "uid-parent", "kid@example-isd.net": "uid-kid" };
const uidFor = (e: string) => uids[e] ?? null;

describe("planMemberReconcile", () => {
  it("provisions everyone who has since signed in", () => {
    const plan = planMemberReconcile(["parent@x.com", "kid@example-isd.net"], [pending("parent@x.com"), pending("kid@example-isd.net", "student")], uidFor);
    expect(plan.provision.map((p) => [p.email, p.uid, p.role])).toEqual([
      ["parent@x.com", "uid-parent", "parent"],
      ["kid@example-isd.net", "uid-kid", "student"],
    ]);
    expect(plan.keep).toEqual([]);
  });

  it("keeps anyone who has not signed in yet", () => {
    const plan = planMemberReconcile(["new@x.com"], [pending("new@x.com")], uidFor);
    expect(plan.provision).toEqual([]);
    expect(plan.keep.map((p) => p.email)).toEqual(["new@x.com"]);
  });

  it("drops a queued email that was taken off the allowlist, even if they have signed in", () => {
    const plan = planMemberReconcile(["someone-else@x.com"], [pending("parent@x.com")], uidFor);
    expect(plan.provision).toEqual([]);
    expect(plan.keep).toEqual([]);
    expect(plan.dropped.map((p) => p.email)).toEqual(["parent@x.com"]);
  });

  it("matches allowlist and queue case-insensitively and dedupes the queue", () => {
    const plan = planMemberReconcile(["PARENT@x.com"], [pending("Parent@X.com"), pending("parent@x.com")], uidFor);
    expect(plan.provision.map((p) => p.email)).toEqual(["parent@x.com"]);
  });

  it("is a no-op on an empty queue", () => {
    expect(planMemberReconcile(["parent@x.com"], [], uidFor)).toEqual({ provision: [], keep: [], dropped: [] });
  });
});

describe("memberDoc", () => {
  it("writes the shape the rules gate on", () => {
    expect(memberDoc(pending("Parent@X.com"), "Alex Rivers")).toEqual({
      role: "parent",
      email: "parent@x.com",
      displayName: "Alex Rivers",
      studentIds: ["primary"],
      prefs: { push: true, digestHour: 7 },
    });
  });
});

describe("removeProcessed", () => {
  it("keeps an entry queued while the reconcile was running", () => {
    // The queue re-read inside the transaction has someone seed.ts added after this run looked up Auth.
    const fresh = [pending("parent@x.com"), pending("late@x.com")];
    expect(removeProcessed(fresh, ["parent@x.com"]).map((p) => p.email)).toEqual(["late@x.com"]);
  });

  it("removes processed entries case-insensitively", () => {
    expect(removeProcessed([pending("Parent@X.com")], ["parent@x.com"])).toEqual([]);
  });

  it("leaves the queue alone when nothing was processed", () => {
    const q = [pending("a@x.com"), pending("b@x.com")];
    expect(removeProcessed(q, [])).toEqual(q);
  });
});

describe("memberDoc prefs", () => {
  it("seeds default prefs for a new member", () => {
    expect(memberDoc(pending("a@x.com"), "").prefs).toEqual({ push: true, digestHour: 7 });
  });

  it("omits prefs when the member doc already exists, so a re-provision cannot reset them", () => {
    expect(memberDoc(pending("a@x.com"), "", { withPrefs: false })).not.toHaveProperty("prefs");
  });
});
