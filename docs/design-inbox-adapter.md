# Inbox adapter — school mail → `families/{id}/messages`

## Goal

Fill the Messages tab (and the Activity "Messages" filter) that shipped empty with the redesign: every
teacher / school / district email in the family's mailbox becomes one `Message` doc — category, a short
parent-facing Markdown summary, action items with due dates, and a link to the student/course when the
sender is a known teacher — plus a `new_message` change event.

## What already exists (reused, not rebuilt)

| Piece | Where | Reuse |
|---|---|---|
| Microsoft Graph mailbox source (device-code login, cached refresh token, `Mail.Read`) | `services/collector/src/links/graph.ts` | `fetchSchoolMailGraph()` — gains an `fromAddresses` allow-list |
| `EmailMessage` shape, `.eml` parsing | `links/extract.ts`, `links/index.ts#parseEml` | fixtures + `--eml` dry runs |
| Claude via subscription (Agent SDK `query()`, `CLAUDE_CODE_OAUTH_TOKEN`) | `scripts/claude-ping.ts`, `.env` on the collector host | classifier |
| `Message`, `MessageCategory`, `ChangeEvent(new_message)` schemas | `packages/shared` | +`fromEmail`, `sourceId` |
| Messages page, Activity filter, `describeChange` | `apps/web` | no UI work needed |
| Batcher, `writeRun`, `stableId` | `sink/firestore.ts`, `util.ts` | |
| Run health: `DEFAULT_INTERVALS.outlook = 60` | `apps/web/src/lib/freshness.ts` | timer is hourly |

## Design

```
--adapter outlook
  Graph: mail since N days from school domains + extra senders (a forwarding parent)
  → drop ids already in families/{f}/messages (db.getAll on candidate ids)
  → for each (cap SKOOLIE_INBOX_MAX per run, oldest first):
       html → text (cheerio, ≤ 6k chars)
       sender pre-filter → category guess + linked teacher/course   (pure, tested)
       Claude Sonnet 5, 1 turn, no tools, JSON-only reply           (injectable, mocked in tests)
       parse (zod) → Message; on any failure → deterministic fallback + warning
  → batch: messages/{id} + changeEvents (new_message) + run doc
```

- **Id**: `outlook:<sha1-16 of Graph id>`; the raw Graph id lives in `sourceId`. Graph ids are ~150 chars.
- **Sender allow-list**: `SKOOLIE_SCHOOL_DOMAINS` (existing) + `SKOOLIE_INBOX_SENDERS` (comma list; default
  empty; useful when another parent forwards teacher mail from their own account). The classifier is told
  forwarded mail should be judged by the original sender in the body.
- **Body is never stored** — only the summary. Dumps go to `SKOOLIE_DUMP_DIR` with `--dump`, like HAC.
- **Fallback classification** (no token / model error / bad JSON): category from the sender pre-filter,
  summary = first 300 chars of the text, no action items, `warnings[]` gets a line. The run is still `ok`
  so the freshness chip stays honest about *mail* being collected; `counts.fallback` shows the model was skipped.
- **Idempotent**: re-running never re-classifies a stored message (dedup by id before the model call).
- **Timer**: `skoolie-inbox.timer`, hourly 06–22 CT as a user unit (same shape as `skoolie-links`).

## Not implemented

- Marking messages read from the app: rules make `messages` client-read-only. Needs a prefs-style rule
  (`hasOnly(['read'])`) — small follow-up.
- Gmail source (`source: "gmail"`): the schema reserves it, but no adapter is written.
- Attachments in mail (permission slips as PDFs): not fetched.

## Status

Shipped: the shared schema fields, `inbox/{text,prefilter,classify,index}.ts` with tests (including a
fast-check property that any model reply yields a valid classification), `run.ts --adapter outlook`,
config and `.env.example` entries, and the deploy units. `pnpm verify` is green.
