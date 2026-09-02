#!/usr/bin/env tsx
/**
 * skoolie collector CLI.
 *   --adapter hac            which source to run (Phase 1: hac only)
 *   --dry-run                print normalized JSON, write nothing to Firestore
 *   --dump                   save raw HTML to $SKOOLIE_DUMP_DIR (PII! never commit)
 *   --all-periods            fetch every marking period, not just the current one
 *   --student <id>           student doc id (default: "primary")
 *   --adapter links          harvest teacher website/Classroom links from school mail (IMAP env) and/or --eml files
 *   --eml <file>             (links) parse a saved .eml instead of / in addition to the mailbox; repeatable
 *   --graph-login            (links) one-time Microsoft device-code sign-in; caches the token at SKOOLIE_GRAPH_TOKEN_CACHE
 *   --adapter members        only drain families/{id}.pendingMembers (every run does this first anyway)
 *   --adapter outlook        school mail → families/{id}/messages, summarized by Claude; --eml files work here too
 *   --limit <n>              (outlook) classify at most n messages this run (default SKOOLIE_INBOX_MAX)
 */
import "./boot.js";
import { parseArgs } from "node:util";
import { HacSnapshot, type Run } from "@skoolie/shared";
import { HacAuthError, HacClient, HacPageError } from "./adapters/hac/client.js";
import { collectHac } from "./adapters/hac/index.js";
import { commitHarvest, harvestLinks } from "./links/index.js";
import { graphLogin } from "./links/graph.js";
import { claudeModelCall } from "./inbox/classify.js";
import { commitInbox, planInbox, type InboxSource } from "./inbox/index.js";
import { parseEml } from "./links/index.js";
import { loadEnv } from "./config.js";
import { reconcileMembers } from "./members.js";
import { initFirestore, newRunId, writeHacSnapshot, writeRun } from "./sink/firestore.js";
import { nowIso } from "./util.js";

const { values: args } = parseArgs({
  options: {
    adapter: { type: "string", default: "hac" },
    "dry-run": { type: "boolean", default: false },
    dump: { type: "boolean", default: false },
    "all-periods": { type: "boolean", default: false },
    student: { type: "string", default: "primary" },
    eml: { type: "string", multiple: true, default: [] },
    "graph-login": { type: "boolean", default: false },
    limit: { type: "string" },
  },
});

const log = (m: string) => console.error(`[${new Date().toISOString()}] ${m}`);

async function main(): Promise<number> {
  const env = loadEnv();
  const membersOk = await runMembers(env);
  if (args.adapter === "members") return membersOk ? 0 : 1;
  if (args.adapter === "links") return runLinks(env);
  if (args.adapter === "outlook") return runInbox(env);
  if (args.adapter !== "hac") throw new Error(`adapter not implemented yet: ${args.adapter}`);

  const runId = newRunId("hac");
  const run: Run = { id: runId, adapter: "hac", startedAt: nowIso(), finishedAt: null, ok: false, counts: {}, warnings: [] };
  const db = args["dry-run"] ? null : await initFirestore(env.GOOGLE_APPLICATION_CREDENTIALS);

  try {
    const http = new HacClient(env.HAC_BASE_URL, env.HAC_USERNAME, env.HAC_PASSWORD, { sessionFile: env.SKOOLIE_SESSION_FILE });
    const result = await collectHac(http, {
      familyId: env.SKOOLIE_FAMILY_ID,
      studentId: args.student!,
      baseUrl: env.HAC_BASE_URL,
      timeZone: env.SKOOLIE_TZ,
      allMarkingPeriods: args["all-periods"]!,
      ...(args.dump ? { dumpDir: env.SKOOLIE_DUMP_DIR } : {}),
      log,
    });
    run.warnings = result.warnings;
    const snapshot = HacSnapshot.parse({
      student: result.student,
      courses: result.courses,
      assignments: result.assignments,
      attendance: result.attendance,
      testScores: result.testScores,
    });
    run.counts = { pagesFetched: result.pagesFetched, logins: http.loginCount, courses: snapshot.courses.length, assignments: snapshot.assignments.length };

    if (!db) {
      run.ok = true;
      console.log(JSON.stringify({ run: { ...run, finishedAt: nowIso() }, snapshot }, null, 2));
    } else {
      const sink = await writeHacSnapshot(db, env.SKOOLIE_FAMILY_ID, runId, snapshot);
      run.counts = { ...run.counts, ...sink.counts };
      log(`hac: wrote ${sink.counts.assignments} assignments, ${sink.counts.changes} change events`);
    }
    run.ok = true;
    return 0;
  } catch (e) {
    const err = e as Error;
    run.error = err instanceof HacAuthError ? `auth: ${err.message}` : err instanceof HacPageError ? `hac-error-page: ${err.message}` : err.message;
    log(`hac: FAILED ${run.error}`);
    return err instanceof HacAuthError ? 3 : err instanceof HacPageError ? 4 : 1;
  } finally {
    run.finishedAt = nowIso();
    if (db) await writeRun(db, env.SKOOLIE_FAMILY_ID, run);
    for (const w of run.warnings) log(`warning: ${w}`);
  }
}

/**
 * Provision member docs for anyone queued on families/{id}.pendingMembers who has signed in since.
 * Runs ahead of every adapter (it is one document read when the queue is empty) so adding someone to the
 * family is a single seed command: the second half lands on its own once they sign in. Never fatal when it
 * precedes another adapter — a membership hiccup must not cost us a collector run — but `--adapter members`
 * has nothing else to do, so there it is the exit status, or a cron failure looks like a clean run.
 */
async function runMembers(env: ReturnType<typeof loadEnv>): Promise<boolean> {
  const explicit = args.adapter === "members";
  if (args["dry-run"] && !explicit) return true; // --dry-run smoke tests must not touch Firestore at all
  try {
    const db = await initFirestore(env.GOOGLE_APPLICATION_CREDENTIALS);
    const r = await reconcileMembers(db, env.SKOOLIE_FAMILY_ID, { log, dryRun: args["dry-run"]! });
    if (explicit || r.provisioned > 0) log(`members: ${r.provisioned} provisioned, ${r.pending} still pending, ${r.dropped} dropped`);
    return true;
  } catch (e) {
    log(`members: reconcile FAILED${explicit ? "" : " (non-fatal)"}: ${(e as Error).message}`);
    return false;
  }
}

/** Teacher links: reads Firestore even on --dry-run (needs the teacher list); only the write is skipped. */
async function runLinks(env: ReturnType<typeof loadEnv>): Promise<number> {
  const runId = newRunId("links");
  const run: Run = { id: runId, adapter: "links", startedAt: nowIso(), finishedAt: null, ok: false, counts: {}, warnings: [] };
  const graph = env.SKOOLIE_GRAPH_CLIENT_ID
    ? { clientId: env.SKOOLIE_GRAPH_CLIENT_ID, tenantId: env.SKOOLIE_GRAPH_TENANT_ID, cachePath: env.SKOOLIE_GRAPH_TOKEN_CACHE, days: env.SKOOLIE_LINKS_DAYS, fromDomains: env.SKOOLIE_SCHOOL_DOMAINS.split(",").map((s) => s.trim()).filter(Boolean) }
    : undefined;
  if (args["graph-login"]) {
    if (!graph) throw new Error("--graph-login needs SKOOLIE_GRAPH_CLIENT_ID");
    const who = await graphLogin(graph);
    log(`links: signed in to Microsoft as ${who}; token cached at ${graph.cachePath}`);
    return 0;
  }
  const db = await initFirestore(env.GOOGLE_APPLICATION_CREDENTIALS);
  const imap =
    env.SKOOLIE_IMAP_HOST && env.SKOOLIE_IMAP_USER && env.SKOOLIE_IMAP_PASS
      ? { host: env.SKOOLIE_IMAP_HOST, port: env.SKOOLIE_IMAP_PORT, user: env.SKOOLIE_IMAP_USER, pass: env.SKOOLIE_IMAP_PASS, mailbox: env.SKOOLIE_IMAP_MAILBOX, days: env.SKOOLIE_LINKS_DAYS, fromDomains: env.SKOOLIE_SCHOOL_DOMAINS.split(",").map((s) => s.trim()).filter(Boolean) }
      : undefined;
  if (!imap && !graph && args.eml!.length === 0) {
    log("links: no mailbox configured (SKOOLIE_GRAPH_CLIENT_ID or SKOOLIE_IMAP_HOST/USER/PASS) and no --eml files; nothing to do");
    return 0;
  }
  try {
    const r = await harvestLinks(db, { familyId: env.SKOOLIE_FAMILY_ID, studentId: args.student!, ...(imap ? { imap } : {}), ...(graph ? { graph } : {}), emlFiles: args.eml!, log });
    run.counts = { teachers: r.teachers, messages: r.messages, found: r.found.length, added: r.added.length, total: r.merged.length };
    for (const l of r.added) log(`links: + ${l.email} ${l.kind ?? "?"} ${l.label ?? ""} ${l.url}  (${l.evidence ?? ""})`);
    if (args["dry-run"]) {
      console.log(JSON.stringify({ run, added: r.added, merged: r.merged }, null, 2));
    } else {
      await commitHarvest(db, env.SKOOLIE_FAMILY_ID, r, imap ? { imapKey: `${imap.user}@${imap.host}/${imap.mailbox}` } : {});
      log(`links: wrote ${r.merged.length} teacher links (${r.added.length} new)`);
    }
    run.ok = true;
    return 0;
  } catch (e) {
    run.error = (e as Error).message;
    log(`links: FAILED ${run.error}`);
    return 1;
  } finally {
    run.finishedAt = nowIso();
    if (!args["dry-run"]) await writeRun(db, env.SKOOLIE_FAMILY_ID, run);
  }
}

/** Inbox: school mail → messages. Reads Firestore even on --dry-run (context + dedup); only the write is skipped. */
async function runInbox(env: ReturnType<typeof loadEnv>): Promise<number> {
  const runId = newRunId("outlook");
  const run: Run = { id: runId, adapter: "outlook", startedAt: nowIso(), finishedAt: null, ok: false, counts: {}, warnings: [] };
  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const graph = env.SKOOLIE_GRAPH_CLIENT_ID
    ? { clientId: env.SKOOLIE_GRAPH_CLIENT_ID, tenantId: env.SKOOLIE_GRAPH_TENANT_ID, cachePath: env.SKOOLIE_GRAPH_TOKEN_CACHE, days: env.SKOOLIE_INBOX_DAYS, fromDomains: csv(env.SKOOLIE_SCHOOL_DOMAINS) }
    : undefined;
  const eml: InboxSource[] = [];
  for (const f of args.eml!) eml.push({ ...(await parseEml(f)), sourceId: `eml:${f}` });
  if (!graph && eml.length === 0) {
    log("outlook: no mailbox configured (SKOOLIE_GRAPH_CLIENT_ID) and no --eml files; nothing to do");
    return 0;
  }
  const max = args.limit === undefined ? env.SKOOLIE_INBOX_MAX : Number(args.limit);
  if (!Number.isInteger(max) || max <= 0) throw new Error(`--limit must be a positive integer, got ${JSON.stringify(args.limit)}`);
  const db = await initFirestore(env.GOOGLE_APPLICATION_CREDENTIALS);
  const model = env.CLAUDE_CODE_OAUTH_TOKEN ? claudeModelCall(env.SKOOLIE_INBOX_MODEL) : null;
  if (!model) log("outlook: CLAUDE_CODE_OAUTH_TOKEN unset — storing fallback summaries only");
  try {
    const plan = await planInbox(db, {
      familyId: env.SKOOLIE_FAMILY_ID,
      ...(graph ? { graph } : {}),
      messages: eml,
      forwarders: csv(env.SKOOLIE_INBOX_SENDERS),
      schoolDomains: csv(env.SKOOLIE_SCHOOL_DOMAINS),
      max,
      timeZone: env.SKOOLIE_TZ,
      model,
      log,
    });
    run.counts = plan.counts;
    run.warnings = plan.warnings;
    if (args["dry-run"]) {
      console.log(JSON.stringify({ run, messages: plan.messages, changes: plan.changes }, null, 2));
    } else {
      await commitInbox(db, env.SKOOLIE_FAMILY_ID, plan);
      log(`outlook: wrote ${plan.messages.length} messages (${plan.counts.fallback ?? 0} fallback), ${plan.changes.length} change events`);
    }
    run.ok = true;
    return 0;
  } catch (e) {
    run.error = (e as Error).message;
    log(`outlook: FAILED ${run.error}`);
    return 1;
  } finally {
    run.finishedAt = nowIso();
    if (!args["dry-run"]) await writeRun(db, env.SKOOLIE_FAMILY_ID, run);
    for (const w of run.warnings) log(`warning: ${w}`);
  }
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
