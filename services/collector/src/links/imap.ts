/**
 * Mailbox source for the link harvester: IMAP (Gmail app password today; any IMAP box that receives
 * example-isd.org mail — e.g. an Outlook rule forwarding school mail to Gmail). Read-only: never flags or moves.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailMessage } from "./extract.js";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  mailbox: string;
  /** Only messages newer than this many days. */
  days: number;
  /** Sender domains to consider (case-insensitive substring on the From header). */
  fromDomains: string[];
  /** Skip these UIDs (already processed). */
  seenUids?: ReadonlySet<number>;
  log?: (m: string) => void;
}

export interface ImapMessage extends EmailMessage {
  uid: number;
}

export async function fetchSchoolMail(cfg: ImapConfig): Promise<ImapMessage[]> {
  const log = cfg.log ?? (() => {});
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  const out: ImapMessage[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock(cfg.mailbox);
    try {
      const since = new Date(Date.now() - cfg.days * 86_400_000);
      // One search per domain; IMAP OR nesting is awkward across servers.
      const uids = new Set<number>();
      for (const d of cfg.fromDomains) {
        const found = await client.search({ since, from: d }, { uid: true });
        for (const u of found || []) uids.add(u);
      }
      const wanted = [...uids].filter((u) => !cfg.seenUids?.has(u)).sort((a, b) => a - b);
      log(`imap: ${uids.size} school messages since ${since.toISOString().slice(0, 10)}, ${wanted.length} new`);
      if (wanted.length === 0) return out;
      for await (const msg of client.fetch(wanted, { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const fromAddr = parsed.from?.text ?? "";
        out.push({
          uid: msg.uid,
          from: fromAddr,
          subject: parsed.subject ?? "",
          date: (parsed.date ?? new Date()).toISOString(),
          ...(parsed.text ? { text: parsed.text } : {}),
          ...(typeof parsed.html === "string" ? { html: parsed.html } : {}),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
