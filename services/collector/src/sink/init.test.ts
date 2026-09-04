import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initFirestore } from "./firestore.js";

const admin = vi.hoisted(() => ({
  apps: [] as object[],
  initArgs: [] as unknown[],
  certArgs: [] as unknown[],
  firestoreFor: [] as unknown[],
}));

vi.mock("firebase-admin/app", () => ({
  getApps: () => admin.apps,
  initializeApp: (opts?: unknown) => {
    admin.initArgs.push(opts);
    const app = { name: `app-${admin.apps.length}` };
    admin.apps.push(app);
    return app;
  },
  cert: (sa: unknown) => {
    admin.certArgs.push(sa);
    return { kind: "cert", sa };
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (app: unknown) => {
    admin.firestoreFor.push(app);
    return { app };
  },
}));

beforeEach(() => {
  admin.apps = [];
  admin.initArgs = [];
  admin.certArgs = [];
  admin.firestoreFor = [];
});

describe("initFirestore", () => {
  it("uses application default credentials when no key file is configured (emulator, or a GCP host)", async () => {
    await initFirestore();
    expect(admin.initArgs).toEqual([undefined]);
    expect(admin.certArgs).toEqual([]);
  });

  it("signs in with the service-account key file when one is configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skoolie-sa-"));
    const path = join(dir, "sa.json");
    const sa = { project_id: "skoolie-oss-test", client_email: "collector@skoolie-oss-test.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n" };
    await writeFile(path, JSON.stringify(sa));
    await initFirestore(path);
    expect(admin.certArgs).toEqual([sa]);
    expect(admin.initArgs).toEqual([{ credential: { kind: "cert", sa } }]);
  });

  it("reuses the app a previous call set up, so a second adapter in one run does not re-initialize", async () => {
    const first = await initFirestore();
    const second = await initFirestore("/ignored/because/an/app/already/exists.json");
    expect(admin.initArgs).toHaveLength(1);
    expect(admin.firestoreFor).toEqual([admin.apps[0], admin.apps[0]]);
    expect(second).toEqual(first);
  });

  it("surfaces an unreadable key file instead of silently falling back to no credentials", async () => {
    await expect(initFirestore("/nonexistent/sa.json")).rejects.toThrow(/ENOENT/);
    expect(admin.initArgs).toEqual([]);
  });
});
