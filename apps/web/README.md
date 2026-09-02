# @skoolie/web

The dashboard. React 19 + Vite + React Router, on Meta's [Astryx](https://astryx.atmeta.com) design
system, reading Firestore in realtime with Google sign-in behind an allowlist.

Designed phone-first, because that's where a parent actually checks whether homework got turned in.

## Run it

```bash
VITE_DEMO=1 pnpm dev            # fixture data, no Firebase, no sign-in — start here
pnpm dev                        # the real thing; needs .env (see .env.example)
```

**Demo mode** (`VITE_DEMO=1`) swaps the entire data layer for [`src/demo.ts`](src/demo.ts) and stubs
the auth user. Nothing touches the network. It's how the e2e suite and the screenshot gate run, which
means it can't silently rot — and it's the right way to work on UI without a district account.

## Routes

```
/                              family overview (all students)  ·  /?all forces it
/s/:studentId                  home — needs attention, this week, averages, what changed
/s/:studentId/assignments      list, filterable      /assignments/:assignmentId opens a sheet
/s/:studentId/grades           per-course averages   /grades/:courseId opens the trend
/s/:studentId/attendance       month grid
/s/:studentId/tests            standardized-test history
/s/:studentId/calendar         due dates by day
/s/:studentId/teachers         contacts + harvested links   /teachers/:teacherKey opens a sheet
/activity                      every change event, family-wide
/messages                      school-mail summaries         /messages/:messageId
/status                        collector health — adapters, last runs, failures
/settings                      theme, prefs
```

Detail views are **routed sheets**, not local state: `/assignments/a1` is a real URL you can link,
reload and share. On a phone it's a bottom sheet; on desktop it's the same component.

## How it's put together

| Directory | What's in it |
|---|---|
| `src/lib/` | **All the logic**, as pure functions with unit tests beside them — grade math, attendance buckets, freshness, filters, contact grouping, trends |
| `src/pages/` | One component per route. Thin: they arrange components and call `lib/` |
| `src/app/` | Shell, routing, auth gate, student switcher, prefs |
| `src/charts/` | Sparklines and trend charts |
| `src/ui/` | The few shared bits Astryx doesn't cover |
| `src/data.ts` | Firestore subscriptions |
| `src/demo.ts` | The fixture family |

The split matters: `lib/` is where the mutation testing is pointed, because that's where a wrong
answer is a wrong number in front of a parent. Components stay thin so they stay boring.

## Design system

Astryx supplies the components; the project supplies a theme.

```bash
pnpm theme:build     # src/theme.ts → src/skoolie.{css,js,d.ts}
```

The generated files are **committed** — regenerate them in the same commit as any `theme.ts` change,
or the build and the source disagree. `prebuild` runs it too.

House rules, enforced by review rather than a linter:

- **No raw `<div>` for layout.** Astryx components own layout and spacing, including the page frame.
- **No hardcoded values.** Colors and spacing come from tokens (`var(--color-*)`, `var(--spacing-*)`).
  Brand color belongs in `theme.ts`, never overridden in `:root`.
- **Dense data is rows**, not cards. `Card` is for standalone widgets.

`apps/web/.claude/CLAUDE.md` has the full Astryx CLI workflow — it's written for AI agents but it's
the same guidance a human wants.

The design rationale, including why attendance uses a hand-rolled grid instead of Astryx `Calendar`,
is in [docs/design-ui.md](../../docs/design-ui.md).

## Testing

```bash
pnpm test                       # vitest + testing-library
pnpm e2e                        # Playwright against the demo build
pnpm shots                      # 64 screenshots: every route × phone/desktop × light/dark
```

**`shots` is a real gate, not a nicety.** It builds the demo app, visits every route at 390×844 and
1280×900 in both themes, and **fails on any console error or horizontal overflow**. Horizontal
overflow on a phone is the single most common way this UI breaks, and types can't catch it. Output
goes to `shots/` (gitignored); the curated ones in `docs/screenshots/` come from here.

Needs Chromium once: `pnpm exec playwright install chromium`.

## Configuration

`VITE_*` variables are compiled into the bundle and **visible to anyone with the URL**. That's fine
for Firebase web config — those values identify the project, they don't authorize anything. Access is
enforced by Firestore rules and the auth allowlist, never by hiding the config.

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_*` | Web app config from the Firebase console |
| `VITE_SKOOLIE_FAMILY_ID` | Which `families/` document to read |
| `VITE_HAC_BASE_URL` | Your district's HAC origin, same as the collector's `HAC_BASE_URL`. Only builds the "Open in HAC" deep link for assignments that carry no URL of their own; unset means that button is hidden rather than pointed somewhere wrong |
| `VITE_SKOOLIE_TZ` | The school's timezone — must match the collector's `SKOOLIE_TZ`, or "due today" disagrees between the two. Validated at load; an invalid zone warns and falls back to `America/Chicago` |
| `VITE_USE_EMULATORS` | `1` points auth and Firestore at local emulators |
| `VITE_DEMO` | `1` for fixture data and no network |

## Deploying

```bash
pnpm build
cd ../../firebase && firebase deploy --only hosting
```

Build from a full checkout. `.env` is gitignored, so a build that can't see it ships an empty Firebase
config and the deployed page comes up blank with no error — a genuinely confusing failure that has
happened more than once. If a deploy goes white, check the built chunk for your project id first.
