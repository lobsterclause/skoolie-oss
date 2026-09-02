# skoolie runbook

Setting it up from scratch, and what to do when it breaks. Everything here assumes you are running
skoolie for your own family against your own Firebase project.

## 1. Things only a human can do

These are the blockers for a first real run. Nothing in the code can do them for you.

| # | Task | Where | Done when |
|---|------|-------|-----------|
| 1 | A working HAC parent account | `https://<your-hac-host>/HomeAccess/Account/LogOn`. "Click Here to Register" needs a campus access code — ask your school's front office if you never got one. "Forgot My User Name or Password" if you had one. | You can sign in and see Assignments for your student |
| 2 | A Firebase project | [console.firebase.google.com](https://console.firebase.google.com) → create a project → enable **Firestore** (pick a region near you) and **Authentication → Google** | `firebase use --add` in `firebase/` points `.firebaserc` at it |
| 3 | A service account for the collector | Firebase console → Project settings → Service accounts → Generate new private key | The JSON is on the collector host at a path you set as `GOOGLE_APPLICATION_CREDENTIALS`, mode 0600, gitignored |
| 4 | Web config for the app | `firebase apps:sdkconfig web` (or console → Project settings → Your apps) | `apps/web/.env` is filled in from `.env.example` |
| 5 | Seed the allowlist | `pnpm --filter @skoolie/collector exec tsx src/scripts/seed.ts --family <id> --parent you@example.com` — run once per person you add | You can sign in to the app without the "not on the family list" screen |
| 6 | *(optional)* A model token for the inbox adapter | `claude setup-token` on the collector host, into `.env` as `CLAUDE_CODE_OAUTH_TOKEN` | Mail summaries are model-written instead of the deterministic fallback |
| 7 | *(optional)* A Microsoft Entra app for mail | See [Reading school mail](#reading-school-mail-optional) below | `--adapter links --graph-login` completes |

## 2. Deploy the Firestore rules

Nothing should touch the database before its rules are in place.

```bash
cd firebase
firebase use --add                     # select your project, alias it "default"
firebase deploy --only firestore       # rules + indexes
```

`pnpm test:rules` runs the rules unit tests against the emulator; it is part of `pnpm verify` and
needs a JRE (`brew install openjdk@21`).

## 3. Seed the family documents

Sign in to the web app once with Google so Firebase Auth creates the user, then run the seed script,
or create these documents by hand in the console:

```
families/<id>                 { allowlist: ["you@example.com", "<other parent>", "<student school email>"] }
families/<id>/members/<uid>   { role: "parent", email: "you@example.com", studentIds: ["primary"],
                                prefs: { push: true, digestHour: 7 } }
# pendingMembers: [{ email, role, studentIds }] — allowlisted but not yet in Firebase Auth.
# Every collector run drains this queue, so you can seed someone before their first sign-in.
```

Both the allowlist entry **and** the `members/<uid>` document are required — the rules check both.
`students/primary` and everything under it is created by the collector on its first run.

## 4. First collector run

```bash
cd services/collector
cp .env.example .env          # fill in HAC_BASE_URL, HAC_USERNAME, HAC_PASSWORD, SKOOLIE_FAMILY_ID
pnpm exec tsx src/run.ts --adapter hac --dry-run --dump
```

`--dry-run` writes nothing to Firestore; `--dump` saves the raw HAC HTML to `SKOOLIE_DUMP_DIR` so you
can see what the parser saw. **Those dumps contain your child's records** — the directory is
gitignored, and it should stay that way.

Read the dry-run JSON: is the student name, grade and school right? Do the course names look sane? Are
the assignment counts plausible? If a parser came back empty, the run's `warnings` name the page.
Open the matching dump, fix the selector in `services/collector/src/adapters/hac/parse.ts`, and add a
**synthetic** fixture in `services/collector/fixtures/hac/` that reproduces your district's markup, so
the tests guard it. Do not commit a real dump.

Then a real write:

```bash
pnpm exec tsx src/run.ts --adapter hac
```

Confirm `families/<id>/runs/<runId>.ok == true` in the console, then set up the timer.

## 5. Run it on a schedule

`deploy/collector/` has a Dockerfile, a compose file, and systemd service + timer units; see
[`deploy/collector/README.md`](../deploy/collector/README.md) for the directory layout it expects and
for how to substitute your own account into the units. The shape is:

```bash
cd <repo>/deploy/collector
docker compose build
docker compose run --rm collector --adapter hac --dry-run   # sanity check in the container

# skoolie-collector is a SYSTEM unit (it wants docker.service, which a user manager cannot see).
# The shipped file carries User=REPLACE_WITH_YOUR_USER, so substitute your own account as you install it.
sed "s/^User=.*/User=$USER/" skoolie-collector.service | sudo tee /etc/systemd/system/skoolie-collector.service >/dev/null
sudo cp skoolie-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now skoolie-collector.timer
```

A run every few hours is plenty. If you use **user** systemd units, enable lingering
(`loginctl enable-linger <user>`) so timers fire without an active login, and do not add
`Requires=`/`After=docker.service` to a user unit — that dependency does not resolve in the user
manager and the timer fails on its first fire.

## 6. Deploy the web app

```bash
pnpm --filter @skoolie/web build
cd firebase && firebase deploy --only hosting
```

Build from a full checkout: `apps/web/.env` is gitignored, so a build that cannot see it ships an
empty Firebase config and the deployed page comes up blank.

## When something breaks

| Symptom | Where to look |
|---|---|
| Dashboard pill red: `hac failed — auth: ...` | HAC password changed, or the account is locked. Fix `.env` and re-run the service. |
| Pill amber (stale) but no failure | The timer is not firing: `systemctl list-timers skoolie-collector.timer`, then `journalctl -u skoolie-collector -n 50`. A `-` in the NEXT column of an enabled timer means it failed. (Add `--user` for the optional links/inbox timers, which are user units.) |
| Run ok, warnings `assignments: no div.AssignmentClass blocks` | Either an empty gradebook (start of a marking period) or HAC layout drift. Re-run with `--dump` and diff against the fixture. |
| Dashboard shows "not on the family list" | Run the seed. It writes both `families/<id>.allowlist` and `members/<uid>`; the rules need both. If that person has never signed in, the seed queues them on `pendingMembers` and the next collector run provisions them — have them reload afterwards. |
| Someone signed in but still sees the empty-family screen | `onSnapshot`'s error callback is terminal, so a tab that was open before they were provisioned never recovers. A hard reload (or sign out and back in) re-subscribes. |
| HAC starts refusing logins | You are hitting it too hard. Confirm `SKOOLIE_SESSION_FILE` is set and persists between runs, and stop looping the probe scripts — HAC degrades after a burst of fresh logins. |

## Reading school mail (optional)

Both the teacher-link harvester (`--adapter links`) and the inbox adapter (`--adapter outlook`) read
a mailbox that receives school mail. Either source works, both read-only, and neither ever writes to
the mailbox.

**IMAP** is the simple path — set `SKOOLIE_IMAP_HOST`, `SKOOLIE_IMAP_USER`, `SKOOLIE_IMAP_PASS`. For
Gmail that means `imap.gmail.com` and a Google app password (which requires 2-step verification).

**Microsoft Graph** is for mailboxes where password IMAP is disabled, which is typical of Microsoft
365 work and school accounts. One-time setup in the Entra admin center
([entra.microsoft.com](https://entra.microsoft.com) → App registrations → New registration):

1. Name it, supported accounts *Accounts in this organizational directory only*. No redirect URI.
2. **Authentication → Advanced settings → Allow public client flows = Yes.** Device-code sign-in
   needs this.
3. **API permissions → Add → Microsoft Graph → Delegated**: `Mail.Read`, `User.Read`,
   `offline_access`. Grant admin consent.
4. Copy the *Application (client) ID* and *Directory (tenant) ID* into `.env` as
   `SKOOLIE_GRAPH_CLIENT_ID` and `SKOOLIE_GRAPH_TENANT_ID`.

Then:

```bash
pnpm exec tsx src/run.ts --adapter links --graph-login   # prints a code; open the URL and sign in
pnpm exec tsx src/run.ts --adapter links --dry-run       # shows what it would add
```

The refresh token lives in `SKOOLIE_GRAPH_TOKEN_CACHE` (keep it 0600) and renews itself. If a run
logs `run: --adapter links --graph-login`, redo the sign-in.

Set `SKOOLIE_SCHOOL_DOMAINS` to your district's mail domains, or the harvesters have nothing to match
on and will find nothing.

## Inbox adapter (`--adapter outlook`)

School mail → `families/<id>/messages`: one document per email with a category, a ≤90-word Markdown
summary, action items with due dates, and a link to the student and course when the sender is a known
teacher, plus a `new_message` change event. **Body text is never stored.**

- Uses the same Graph app and token as the link harvester. `SKOOLIE_INBOX_DAYS` (14) is the lookback.
- `SKOOLIE_INBOX_SENDERS` adds addresses that count as school mail even though they aren't on a
  school domain — typically a parent who forwards teacher email. The classifier is told to judge a
  forward by its quoted original.
- Summaries come from Claude via `CLAUDE_CODE_OAUTH_TOKEN` (Agent SDK, one turn, no tools). Without
  the token, or when the model fails or returns garbage, the message is still stored with a
  deterministic fallback summary (sender category plus the first 300 characters), and
  `counts.fallback` / `warnings` say so.
- `SKOOLIE_INBOX_MAX` (25) caps model calls per run; the rest are classified on the next run.
  Already-stored ids are never re-classified, so the cost is bounded.
- Dry run: `--adapter outlook --dry-run --limit 3`. Offline: `--eml file.eml`.
- Not yet: marking messages read from the app (the rules make `messages` client-read-only), and mail
  attachments.
