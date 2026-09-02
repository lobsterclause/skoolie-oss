import { z } from "zod";
import { DEFAULT_SCHOOL_TZ, TimeZone } from "@skoolie/shared";

const Env = z.object({
  SKOOLIE_FAMILY_ID: z.string().min(1),
  /** Your district's Home Access Center origin, e.g. https://hac.example-isd.org — no default: it is district-specific. */
  HAC_BASE_URL: z.string().url(),
  HAC_USERNAME: z.string().min(1),
  HAC_PASSWORD: z.string().min(1),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  SKOOLIE_DUMP_DIR: z.string().default("./fixtures/raw"),
  SKOOLIE_PROFILE_DIR: z.string().default("./browser-data"),
  SKOOLIE_SESSION_FILE: z.string().default("./browser-data/hac-session.json"),
  // Link harvester mailbox (optional; IMAP over TLS). Gmail: imap.gmail.com + app password.
  SKOOLIE_IMAP_HOST: z.string().optional(),
  SKOOLIE_IMAP_PORT: z.coerce.number().int().default(993),
  SKOOLIE_IMAP_USER: z.string().optional(),
  SKOOLIE_IMAP_PASS: z.string().optional(),
  SKOOLIE_IMAP_MAILBOX: z.string().default("INBOX"),
  // Microsoft 365 / Outlook via Graph (preferred when school mail lands in a work or school
  // mailbox, where password IMAP is usually disabled): Entra app registration client id.
  SKOOLIE_GRAPH_CLIENT_ID: z.string().optional(),
  SKOOLIE_GRAPH_TENANT_ID: z.string().default("organizations"),
  SKOOLIE_GRAPH_TOKEN_CACHE: z.string().default("./browser-data/msal-cache.json"),
  SKOOLIE_LINKS_DAYS: z.coerce.number().int().positive().default(45),
  /** Comma list of your district's mail domains, e.g. "example-isd.org". Empty means the mail adapters harvest nothing. */
  SKOOLIE_SCHOOL_DOMAINS: z.string().default(""),
  // Inbox adapter (--adapter outlook): school mail → families/{id}/messages. Same Graph app as the link harvester.
  SKOOLIE_INBOX_DAYS: z.coerce.number().int().positive().default(14),
  /** Comma list of extra senders treated as school mail (a parent who forwards teacher email). */
  SKOOLIE_INBOX_SENDERS: z.string().default(""),
  /** Cap on messages classified per run; the rest wait for the next run (bounded model spend). */
  SKOOLIE_INBOX_MAX: z.coerce.number().int().positive().default(25),
  SKOOLIE_INBOX_MODEL: z.string().default("claude-sonnet-5"),
  /**
   * The school's timezone: what "today" means, and how relative dates in mail ("this Friday")
   * resolve. Shared with the web app's VITE_SKOOLIE_TZ — same default, same validity rule. A bad
   * zone fails here before a run starts, rather than producing quietly wrong dates.
   */
  SKOOLIE_TZ: TimeZone.default(DEFAULT_SCHOOL_TZ),
  /** From `claude setup-token`; without it messages are stored with the deterministic fallback summary. */
  CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
});
export type Env = z.infer<typeof Env>;

/**
 * Load `.env` into `process.env` if it exists, without overriding anything already set — so a real
 * environment variable (systemd, `docker compose --env-file`, an inline `FOO=bar` prefix) always wins
 * over the file. `process.loadEnvFile` is built into Node 22, so this costs no dependency.
 *
 * Without this the documented quickstart silently does nothing: neither `tsx` nor `node` reads `.env`
 * on its own, so `cp .env.example .env` followed by a run failed on every required variable.
 */
export function loadDotenv(path = ".env"): void {
  const before = { ...process.env };
  try {
    process.loadEnvFile(path);
  } catch {
    return; // absent, unreadable or malformed: the ambient environment stands on its own
  }
  Object.assign(process.env, before); // ambient wins: put back everything that was already set
}

/**
 * Validate the environment, or throw naming what is missing. Pure: it does NOT read `.env` — an
 * entry point must `import "./boot.js"` first (see boot.ts), and `boot.test.ts` checks that they do.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = Env.safeParse(source);
  if (!r.success) {
    const missing = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${missing}`);
  }
  return r.data;
}
