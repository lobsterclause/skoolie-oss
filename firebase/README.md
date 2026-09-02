# @skoolie/firebase

Firestore security rules, indexes, hosting config, and the emulator tests that prove the rules do what
they claim.

This is the smallest package and the one most worth reading carefully. It's the only thing standing
between a child's education records and anyone who can guess your project id.

## The security model

One sentence: **the collector writes with the Admin SDK, which bypasses rules entirely, so these rules
exist purely to constrain readers — and clients can write exactly one thing.**

```
signedIn(f)        Firebase Auth, and email_verified
  └─ isAllowlisted(f)   ...and their email is in families/{f}.allowlist
       └─ isMember(f)        ...and families/{f}/members/{their uid} exists
            ├─ isParent(f)        ...and that member's role == "parent"
            └─ ownsStudent(f, s)  ...and s is in that member's studentIds
```

Both halves are required, deliberately. The **allowlist** is the invitation — a parent can add an
email before that person has ever signed in. The **member document** is the provisioning, written by
the collector once Firebase Auth actually knows the account. Being on the allowlist alone gets you the
family document and nothing else; having a member document without the allowlist gets you nothing.

What that buys per collection:

| Path | Who can read |
|---|---|
| `families/{f}` | anyone allowlisted |
| `families/{f}/members/{uid}` | parents, or that member themselves |
| `families/{f}/students/{sid}` and everything under it | parents, or a member whose `studentIds` contains `sid` |
| `families/{f}/changeEvents/{c}` | parents, or a member for events about their own student |
| `families/{f}/runs`, `/events` | any member |
| `families/{f}/messages/{m}` | **parents only** — school mail can discuss a child in ways the child shouldn't read |

**Writes:** `allow write: if false` everywhere, with exactly one exception — a member may update their
own `prefs`, enforced with `affectedKeys().hasOnly(['prefs'])` so it can't be used to grant themselves
a role or another student.

The student role is real and used: a teenager can be given their own sign-in that shows their own
work, their own change events, and no messages, no sibling data, and no ability to edit an allowlist.

## Testing the rules

```bash
pnpm test:rules      # boots the Firestore emulator against project demo-skoolie
```

Runs as part of `pnpm verify` at the root. Needs a JRE — `brew install openjdk@21` on macOS. No
Firebase credentials are involved: `demo-*` project ids make the emulator refuse to touch anything
real, which is also why CI can run these with no secrets.

[`test/rules.test.ts`](test/rules.test.ts) covers the cases that matter:

- a parent reads any student and the messages
- a student reads only their own student document, and never messages
- a stranger and an anonymous user are denied
- the exact queries `FamilyProvider` subscribes to succeed (a rule that passes a `get` but fails the
  real `orderBy`/`limit` query is a rule that breaks the app)
- nobody writes anything, except a member updating their own `prefs`

**Any change to who can read what needs a test here.** That's not process for its own sake — rules are
a language where a plausible-looking edit silently opens everything, and there is no type checker.

## Deploying

```bash
firebase use --add                  # point .firebaserc at your project (it ships as a placeholder)
firebase deploy --only firestore    # rules + indexes
```

**Deploy the rules before anything writes data.** A new Firestore database starts in a mode that will
either lock you out or let everyone in, and neither is what you want with real records in it.

```bash
pnpm deploy:rules      # rules + indexes only
pnpm deploy:hosting    # the built web app — build it first
```

`hosting-dist/` is where `apps/web`'s build output is expected, and it's gitignored.

## Indexes

[`firestore.indexes.json`](firestore.indexes.json) holds the composite indexes the dashboard's queries
need — mostly `changeEvents` and `runs` ordered by time. If you add a query and Firestore returns a
"needs an index" error, it includes a console link that will write the index for you; put the result
in this file so the next person doesn't have to rediscover it.
