# @skoolie/shared

Every Firestore document shape, as a [zod](https://zod.dev) schema, plus the handful of pure helpers
that both sides need to agree on.

**This is the contract.** The collector parses whatever HAC gives it and must produce these shapes;
the web app reads these shapes and knows nothing about where they came from. If you're trying to
understand the system, read [`src/index.ts`](src/index.ts) first — it's one file and it's the map.

## Why a shared schema at all

The collector and the UI are separated by a database, which means nothing type-checks between them.
So the schema does three jobs:

1. **Types both sides**, from one definition, with no duplication to drift.
2. **Validates at the boundary.** `HacSnapshot.parse()` runs before anything reaches Firestore, so a
   parser that returns nonsense fails at the door rather than writing nonsense that the UI renders as
   an empty screen three hours later.
3. **Defines what an adapter owes.** A new adapter for a different student information system is done
   when it produces these shapes. Everything downstream keeps working.

## The documents

```
families/{familyId}                    allowlist, pendingMembers, contacts, teacherLinks
  members/{uid}                        Member    — role, studentIds, prefs
  students/{studentId}                 Student   — name, grade, school, counselor
    courses/{courseId}                 Course
    assignments/{assignmentId}         Assignment
    attendance/{date}                  AttendanceDay
    testScores/{testId}                TestScore
  changeEvents/{eventId}               ChangeEvent
  messages/{messageId}                 Message
  runs/{runId}                         Run
```

### The ones worth knowing

**`Assignment`** is the centre of gravity. Its `id` is a stable hash of
`(source, courseId, title, dueDate)`, which is what makes the whole thing idempotent: re-running the
collector rewrites the same document instead of creating a duplicate, and the diff can tell "new
assignment" from "one I've seen". It keeps both a parsed `score` and the `rawScore` string HAC
actually printed (`"M"`, `"X"`, `"95.00"`) so a scoring decision can always be audited, and it tracks
`firstSeenAt` / `lastSeenAt` rather than a single timestamp.

**`AssignmentStatus`** — `upcoming | submitted | graded | missing | late | excused | unknown`. This is
inferred, not given: HAC encodes it in a score cell that might be blank, numeric, or a letter code.
`statusFor()` in the collector does the inference; `unknown` is a real answer and the UI handles it.

**`ChangeEvent`** is what makes this more than a mirror. Each one carries `before` and `after`, a
Firestore `ref` to the document that changed, and `notifiedAt` so a future notifier can tell what it
has already sent.

**`Run`** is the honesty mechanism. `ok`, `counts`, `warnings`, `error`. The UI derives its freshness
pills from these, which is why a broken collector shows up as a red dot rather than as stale numbers
that look fine.

**`Member.prefs`** is the only thing a client may write, and the security rules enforce exactly that.

## The helpers

Pure functions that live here because both sides need the same answer:

| Function | What it decides |
|---|---|
| `classifyAssignment(title, category)` | `homework` / `classwork` / `assessment` / `project` / `other`, from how teachers actually name things — `"Day 3 HW- Dist.Property"` is homework |
| `classifyLink(url)` | What kind of teacher link a URL is — Google Sites, Classroom, Schoology, Canvas, a doc |
| `normalizeLinkUrl(url)` | Canonicalizes for dedupe: lowercase host, drop the hash, strip `utm_*` and trailing slash |
| `mergeTeacherLinks(existing, incoming)` | Upsert where a manual entry always beats a harvested one, and a label or kind already known is never dropped |

These are the most heavily tested code in the repo, including property-based tests with
[fast-check](https://fast-check.dev/) — `mergeTeacherLinks` in particular has to be idempotent and
order-independent, which is exactly the kind of thing example-based tests miss.

## Changing a schema

There's no migration tooling and no versioning. Documents are rewritten in place by the next collector
run, so:

- **Adding an optional field** is free.
- **Adding a required field** means the UI must tolerate documents written before it existed, at least
  until every family has had a run. Prefer `.optional()` or `.default()`.
- **Renaming or removing** a field breaks any deployed UI reading it until both sides ship. This is a
  side project with one known deployment, so that's usually fine — just be deliberate about it.

Any change here means `pnpm verify` at the root, not just in this package: the collector, the web app
and the Firestore rules tests all depend on it.
