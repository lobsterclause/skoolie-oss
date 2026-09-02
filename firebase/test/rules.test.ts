import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const F = "fam";
const parent = { sub: "p1", email: "parent@example.com", email_verified: true };
const kid = { sub: "k1", email: "kid@example.com", email_verified: true };
const stranger = { sub: "x1", email: "stranger@example.com", email_verified: true };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-skoolie",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `families/${F}`), { allowlist: [parent.email, kid.email] });
    await setDoc(doc(db, `families/${F}/members/${parent.sub}`), { role: "parent", email: parent.email, studentIds: ["s1", "s2"], prefs: { push: true } });
    await setDoc(doc(db, `families/${F}/members/${kid.sub}`), { role: "student", email: kid.email, studentIds: ["s1"], prefs: { push: true } });
    await setDoc(doc(db, `families/${F}/students/s1`), { name: "Kid One" });
    await setDoc(doc(db, `families/${F}/students/s2`), { name: "Kid Two" });
    await setDoc(doc(db, `families/${F}/students/s1/assignments/a1`), { title: "HW" });
    await setDoc(doc(db, `families/${F}/messages/m1`), { subject: "hi" });
    await setDoc(doc(db, `families/${F}/runs/r1`), { adapter: "hac", startedAt: "2026-08-28T00:00:00Z", ok: true });
  });
});

describe("firestore rules", () => {
  it("parent reads any student and messages", async () => {
    const db = env.authenticatedContext(parent.sub, parent).firestore();
    await assertSucceeds(getDoc(doc(db, `families/${F}/students/s2`)));
    await assertSucceeds(getDoc(doc(db, `families/${F}/students/s1/assignments/a1`)));
    await assertSucceeds(getDoc(doc(db, `families/${F}/messages/m1`)));
  });
  it("student reads own student only, never messages", async () => {
    const db = env.authenticatedContext(kid.sub, kid).firestore();
    await assertSucceeds(getDoc(doc(db, `families/${F}/students/s1/assignments/a1`)));
    await assertFails(getDoc(doc(db, `families/${F}/students/s2`)));
    await assertFails(getDoc(doc(db, `families/${F}/messages/m1`)));
  });
  it("stranger and anonymous are denied", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext(stranger.sub, stranger).firestore(), `families/${F}/students/s1`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `families/${F}`)));
  });
  // The web app LISTS these collections (the earlier tests only get single docs); a list is allowed only when
  // the rule holds for every possible document, so parent-wide access must not hinge on the document id.
  it("parent lists students and runs (what FamilyProvider subscribes to)", async () => {
    const db = env.authenticatedContext(parent.sub, parent).firestore();
    const students = await assertSucceeds(getDocs(collection(db, `families/${F}/students`)));
    expect(students.size).toBe(2);
    const runs = await assertSucceeds(getDocs(query(collection(db, `families/${F}/runs`), orderBy("startedAt", "desc"), limit(50))));
    expect(runs.size).toBe(1);
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), `families/${F}/students`)));
  });
  it("nobody writes data; member may update own prefs only", async () => {
    const db = env.authenticatedContext(parent.sub, parent).firestore();
    await assertFails(setDoc(doc(db, `families/${F}/students/s1/assignments/a2`), { title: "forged" }));
    await assertSucceeds(updateDoc(doc(db, `families/${F}/members/${parent.sub}`), { prefs: { push: false } }));
    // The web app writes nested prefs by dotted path (theme, last student) — still inside `prefs`.
    await assertSucceeds(updateDoc(doc(db, `families/${F}/members/${parent.sub}`), { "prefs.theme": "dark", "prefs.lastStudentId": "s2" }));
    await assertFails(updateDoc(doc(db, `families/${F}/members/${parent.sub}`), { role: "parent", studentIds: ["s1", "s2", "s3"] }));
    await assertFails(updateDoc(doc(db, `families/${F}/members/${kid.sub}`), { prefs: { push: false } }));
  });
});
