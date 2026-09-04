/**
 * An in-memory stand-in for the slice of Firestore the collector actually uses.
 *
 * The sink, the inbox writer and the member reconcile are mostly *how* they write — batch chunking,
 * merge flags, transaction re-reads — and none of that is visible from the pure helpers. The emulator
 * would cover it but needs a JVM and a port; this covers the same decisions in-process, and records
 * every write in order so a test can assert the shape of the traffic rather than just the end state.
 *
 * Test-only: excluded from coverage and from mutation testing (see vitest.config.ts, stryker.conf.json).
 */
import type { Firestore } from "firebase-admin/firestore";

export interface Write {
  path: string;
  data: Record<string, unknown>;
  merge: boolean;
}

interface Ref {
  readonly path: string;
  readonly id: string;
}

const idOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

/** Firestore merges top-level fields and deep-merges maps; the collector only relies on the former. */
function merged(prev: Record<string, unknown> | undefined, next: Record<string, unknown>, merge: boolean): Record<string, unknown> {
  return merge ? { ...prev, ...next } : { ...next };
}

export class FakeFirestore {
  /** Every write that has been committed, in commit order. */
  readonly writes: Write[] = [];
  /** Ops per committed batch — a batch that chunked shows up as several entries. */
  readonly batchSizes: number[] = [];
  /** How many times runTransaction has run its body (a retry counts twice). */
  transactionRuns = 0;
  /** Set to make the next transaction body throw once, as a contended commit does. */
  failNextTransaction: Error | null = null;

  private readonly docs = new Map<string, Record<string, unknown>>();

  constructor(seed: Record<string, Record<string, unknown>> = {}) {
    for (const [path, data] of Object.entries(seed)) this.docs.set(path, data);
  }

  /** Cast for the code under test, which only ever sees the `Firestore` type. */
  get db(): Firestore {
    return this as unknown as Firestore;
  }

  peek(path: string): Record<string, unknown> | undefined {
    return this.docs.get(path);
  }

  private snap(path: string) {
    const data = this.docs.get(path);
    return { id: idOf(path), exists: data !== undefined, data: () => data, ref: { path, id: idOf(path) } };
  }

  private write(path: string, data: Record<string, unknown>, merge: boolean): void {
    this.docs.set(path, merged(this.docs.get(path), data, merge));
    this.writes.push({ path, data, merge });
  }

  doc(path: string): Ref & { get: () => Promise<ReturnType<FakeFirestore["snap"]>>; set: (data: Record<string, unknown>, opts?: { merge?: boolean }) => Promise<void> } {
    return {
      path,
      id: idOf(path),
      get: async () => this.snap(path),
      set: async (data, opts) => this.write(path, data, opts?.merge === true),
    };
  }

  collection(path: string) {
    return {
      path,
      get: async () => {
        const docs = [...this.docs.keys()]
          .filter((p) => parentOf(p) === path)
          .sort()
          .map((p) => this.snap(p));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }

  async getAll(...refs: Ref[]) {
    return refs.map((r) => this.snap(r.path));
  }

  batch() {
    const queued: Write[] = [];
    return {
      set: (ref: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        queued.push({ path: ref.path, data, merge: opts?.merge === true });
      },
      commit: async () => {
        this.batchSizes.push(queued.length);
        for (const w of queued) this.write(w.path, w.data, w.merge);
        queued.length = 0;
      },
    };
  }

  /**
   * Buffers writes until the body returns, as a real transaction does: a body that throws leaves
   * nothing behind, which is what makes the "provisioned but still queued" case testable.
   */
  async runTransaction<T>(body: (tx: { get: (ref: Ref) => Promise<ReturnType<FakeFirestore["snap"]>>; set: (ref: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) => void }) => Promise<T>): Promise<T> {
    for (;;) {
      this.transactionRuns++;
      const queued: Write[] = [];
      const fail = this.failNextTransaction;
      this.failNextTransaction = null;
      try {
        const out = await body({
          get: async (ref) => this.snap(ref.path),
          set: (ref, data, opts) => queued.push({ path: ref.path, data, merge: opts?.merge === true }),
        });
        if (fail) throw fail;
        this.batchSizes.push(queued.length);
        for (const w of queued) this.write(w.path, w.data, w.merge);
        return out;
      } catch (e) {
        if (e !== fail) throw e; // a real error from the body, not the contention we staged
      }
    }
  }
}
