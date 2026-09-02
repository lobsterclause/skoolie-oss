# skoolie on Astryx — redesign proposal

**Status:** implemented (2026-08-27) — see §9 for what changed between the proposal and the code. Sections 0–8 are the proposal as approved.
**Astryx version verified:** 0.5.0 (Beta), via `npx @astryxdesign/cli` on 2026-08-27. Astryx is Meta's open-source React 19 + StyleX design system (https://astryx.atmeta.com).
**Scope:** `apps/web` only. Collector, services, Firestore rules and `@skoolie/shared` schemas are untouched; the proposal only *adds* read hooks to `apps/web/src/data.ts`.
**Companions:** `docs/astryx-redesign-mockups.html` (static mockups, light + dark) and `docs/astryx-redesign-theme.ts` (the `defineTheme` sketch, build-checked).

Decisions taken up front: mobile-first · dark mode required · kid/family-friendly custom look · top-pinned `TabList` for phone navigation (no custom bottom bar) · extend Astryx's `neutral` theme with a "paper and ink" palette (fountain-pen-blue accent) · Nunito typeface · add screens for all four collected-but-unrendered data sets (activity, attendance + STAAR, messages, calendar).

## 0. Where the app is today

`apps/web/src` is 819 lines: React 19 + Vite 8 + Firebase live snapshots, one 86-line hand-written `styles.css`, no router, no component library.

| Area | Today | Problem the redesign fixes |
|---|---|---|
| Navigation | `useState<Tab>` in `App.tsx` (today / assignments / teachers) | No URLs, no back button, no deep links (Telegram needs them) |
| Student | `member.studentIds[0]` hardcoded at `App.tsx:22` | `useStudents()` already returns a list; no switcher |
| Today | 7 flat buckets + an averages grid, every group in a bordered `.card` | "Everything due 7d" duplicates other buckets; card-everywhere hides what needs attention |
| Assignments | three native `<select>`s, flat list | Filters don't survive reload; no grouping; unreachable on touch when long |
| Rows | badge only for HW/Test/Project; status only in class name | Default states get badges, exceptions don't stand out |
| Freshness | pills with the detail in a `title=` tooltip | Tooltip is unreachable on phones; reauth failure is a red pill, not a call to action |
| Theming | `:root` vars + `prefers-color-scheme` block, no breakpoints | No manual mode, no responsive contract, duplicated button rules, hardcoded badge hex |
| Data | Attendance, STAAR scores, calendar events, messages, `changeEvents` all modeled in `@skoolie/shared` | None rendered; attendance + test scores are collected every run |
| Teacher links (added 2026-08-27, after the first draft) | `family.teacherLinks[]` harvested from school mail by a `links` collector on its own timer; Teachers tab shows Website / Classroom buttons or a "Find site" search fallback | Rendered, but crammed into the row's end slot next to Email; harvest provenance (`evidence`) only in a `title=` tooltip |
| PWA | `manifest.webmanifest` with `display: standalone`, `icons: []` | Not installable with an icon |

**Kept as-is** (pure functions with tests; the JSX around them is free to change): `bucket`, `todayLocal`, `gradeTone` (`views/Today.tsx`), `scoreLabel` (`views/AssignmentRow.tsx`), `mailto`, `groupTeachers`, `linksFor`, `findSiteUrl` (`views/Teachers.tsx`), and the freshness age rule in `views/Freshness.tsx`. Recommendation: move them to `apps/web/src/lib/{buckets,grades,contacts,freshness}.ts` so `views/*` become JSX-only and tests import from `lib/`.

## 1. Goals and principles

Five goals, each with a check that can be verified on a 390×844 phone.

1. **Three-second glance.** The first viewport answers "does any kid need something from me today?" — Check: Missing, Due today, and any re-auth banner are all visible above the fold without scrolling.
2. **Attention, not inventory.** Home shows only what is actionable or new; the full inventory lives one tap away. — Rule: a Home section must be *actionable* (Missing, Due today, Re-auth) or *new* (What changed). "Everything due (7 days)" leaves Home and becomes the Assignments "Open" preset.
3. **Multi-kid from day one.** Every screen is scoped to one student through a switcher; only the Activity feed and the family overview are cross-student. — Check: the `studentIds[0]` hardcode is gone; adding a second student needs no UI change.
4. **Kid-friendly, not childish.** Cool paper-white ground with ink text, Astryx's default radii (crisp, not bubbly), larger base type (17px), one fountain-pen-blue accent, one warm categorical hue per student. No mascots, no illustrations in structural UI; the single "🎉" survives only inside empty-state copy.
5. **Astryx idioms, not a reskin.** Components over primitives (no raw `div`s, no `style={{}}`), semantic tokens only, theme-agnostic code so dark mode is free, dense data as edge-to-edge rows with dividers, `Card` only for things you could reorder or remove independently, `Section` for page regions, frame-first layout.

Anti-goals for v1: no student-facing editing, no in-app notification center (Telegram carries push), no `Table` on phones, no multi-series comparison charts (see §3.10 — every chart is one series with context, or small multiples).

## 2. Information architecture

### 2.1 Shell and primary navigation

Astryx has no bottom tab bar component, and building one from raw elements would break principle 5. The shell is therefore:

```
<Theme theme={skoolieTheme} mode={prefs.theme ?? 'system'}>
  <AppShell height="auto" contentPadding={0} variant="wash"
            banner={<FreshnessBanner/>}
            topNav={<TopNav heading={<Brand/>} startContent={<StudentSwitcher/>} endContent={<FreshnessDot/>} label="Skoolie"/>}
            sideNav={<SideNav label="Pages">…all destinations…</SideNav>}>
    {isMobile && <PrimaryTabs/>}   {/* TabList layout="fill", sticky under the compact TopNav */}
    <Outlet/>
  </AppShell>
</Theme>
```

- **Phone (below the AppShell breakpoint):** AppShell collapses `TopNav` into a compact bar with the `MobileNavToggle`, and moves `SideNav` into the `MobileNav` drawer. The five daily destinations — **Home · Assignments · Grades · Activity · Teachers** — render as a `TabList layout="fill"` (no `role`, so it is a nav landmark with `aria-current`) pinned directly under the bar. Secondary destinations — Attendance, Tests, Calendar, Messages, Status, Settings, Sign out — live in the drawer. `useAppShellMobile()` decides which to render.
- **Desktop:** the `TabList` is not rendered; `SideNav` shows every destination inline. Content is capped at 1100px inside a two-column `Layout` where a screen has a secondary column.
- Rejected: `TopNav` items only (cap of 5 leaves no room for secondary pages on phone), drawer-only navigation (two taps for daily pages), custom bottom bar (custom primitive; recorded as an open question if thumb-zone reach proves to matter in use).

### 2.2 Routing

`react-router` v7 (`createBrowserRouter`) with Astryx's `useLinkComponent()` so `Tab`, `SideNavItem`, `ListItem` and `Link` render real anchors. Firebase Hosting gets the SPA rewrite `** → /index.html`.

| Route | Screen | Notes |
|---|---|---|
| `/` | Family overview | Redirects to `/s/:studentId` when the member has one student |
| `/s/:studentId` | Home | §3.1 |
| `/s/:studentId/assignments?status&kind&course` | Assignments | Filters live in the query string so they survive reload and can be shared |
| `/s/:studentId/assignments/:assignmentId` | Assignment detail | `BottomSheet` over the list on phone, `Dialog` on desktop; deep-linkable |
| `/s/:studentId/grades` · `/attendance` · `/tests` · `/calendar` · `/teachers` | Per-student pages | §3.4–3.5, §2.4 |
| `/activity` | Family-wide change feed | Telegram Mini App landing route |
| `/messages` · `/status` · `/settings` | Family-wide pages | |

Selected student is mirrored to `localStorage` so a bare `/` returns to the last kid.

### 2.3 Student switcher and colour rule

`TopNav startContent` is a single tappable identity pill: `Avatar` (initials, categorical colour) + first name + caret, on one 56px line. Grade and school are **not** in the bar — they live in the switcher sheet — so the compact bar has exactly two groups: the pill at the start, and a labelled freshness chip + `MobileNavToggle` at the end. Tapping the pill opens a `BottomSheet purpose="info" height="hug"` (a `Dialog` on desktop) listing students as `ListItem`s with a `StatusDot variant="error" label="N missing"` when N > 0.

Colour rule — categorical hues are assigned deterministically and never collide with status colours:

- **Students:** fixed order `orange → purple → teal → pink → cyan` by position in `member.studentIds` — warm hues against the cool ground.
- **Courses:** stable hash of `course.id` over the same five hues.
- **Excluded:** `red`, `yellow`, `green` (tied to error / warning / success), `blue` (the accent), and `gray`.
- Tokens used: `--color-background-<hue>` + `--color-text-<hue>` for avatars, `--color-icon-<hue>` for dots, `--color-border-<hue>` for the accent rail.

The active student's hue appears in exactly two places: their avatar, and a 3px top rail on the shell header (`app-shell-header` component override reading `--student-accent`, set on the shell element). Nothing else is tinted, so status colours stay unambiguous.

### 2.4 New surfaces for data that is already collected

| Model (`@skoolie/shared`) | Firestore path (`paths.*`) | Route | Pattern | New hook in `data.ts` |
|---|---|---|---|---|
| `ChangeEvent` (9 types incl. `grade_posted`, `average_changed`, `reauth_needed`) | `families/{f}/changeEvents` | `/activity` | Day-grouped `List`; `Timestamp format="relative" isLive`; new pure `describeChange(e) → {title, detail, tone}` | `useChangeEvents(limit = 100)` |
| `AttendanceDay` | `students/{s}/attendance` | `/s/:id/attendance` | `Calendar` month view with day markers + compact `List` of non-present periods | `useAttendance(sid)` |
| `TestScore` (STAAR) | `students/{s}/testScores` | `/s/:id/tests` | One `Collapsible` per test, subtests as compact `List` (`Table` desktop-only later) | `useTestScores(sid)` |
| `CalendarEvent` | `families/{f}/events` | `/s/:id/calendar` + "This week" strip on Home | `Calendar` + `List` | `useEvents()` |
| `Message` (`summary`, `actionItems`) | `families/{f}/messages` | `/messages` | `List`; `Badge variant="warning"` only when `actionItems.length > 0`; detail sheet renders `summary` with `Markdown` and action items as a checklist | `useMessages()` |
| `Run.warnings / error` | `families/{f}/runs` | `/status` + banner | §3.7 | existing `useRuns()` |
| `TeacherLink[]` (`family.teacherLinks`; kinds `site · classroom · schoology · canvas · doc · other`, `source manual|email|hac`, `evidence`) | `families/{f}` | `/s/:id/teachers` + teacher sheet | §3.5 | existing `useFamily()` |

Messages and calendar collectors are not built yet; those screens ship with their `EmptyState` copy and light up when data arrives.

## 3. Screen by screen

Each screen lists: composition (Astryx tree), phone layout, desktop adaptation, reused functions, loading and empty states. "List" always means `List hasDividers` with `ListItem`s; edge-to-edge, no card wrapper.

### 3.1 Home — `/s/:studentId`

```
Stack (vertical, gap 6)
├─ Section "Needs attention"            List density="balanced"
│    bucket().missing  → ListItem end=<Badge variant="error" label="Missing"/>
│    bucket().dueToday → ListItem end=<Badge variant="warning" label="Due today"/>
│    both empty        → EmptyState isCompact title="All caught up" description="Nothing missing or due today 🎉"
├─ Section "This week"                  List density="compact"
│    bucket().homework ∪ bucket().tests, sorted by dueDate, Text type="label" day headers ("Thu 8/28")
│    tests: start=<StatusDot variant="accent" label="Test" icon=…/> — a mark, not a badge
├─ Section "Grades"                     Grid (2 cols phone, 3–4 desktop) of Card variant="muted" padding={3}
│    course name · average in Heading size with gradeTone() colour · tap → /grades
├─ Section "What changed"               last 5 ChangeEvents for this student · Link "See all" → /activity
└─ Collapsible "Past due, not graded"   only when bucket().overdueUngraded is non-empty
```

- Removed from Home: "Everything due (7 days)" (→ Assignments "Open"), "Recently graded" (→ Activity via `grade_posted`).
- Grades tiles are the one legitimate `Card` use on this screen: each tile is a discrete, reorderable widget.
- Desktop: `Layout` with two panels — attention + week left, grades + changes right.
- Reuses `bucket`, `todayLocal`, `gradeTone`, `scoreLabel`. Loading: five `Skeleton` rows with staggered `index` inside the same `List`. Never the string "Loading…".

### 3.2 Assignments — `/s/:studentId/assignments`

- Controls row: `SegmentedControl label="Status" layout="fill"` with **All · Open · Missing · Graded** (Open = upcoming ∪ unknown ∪ late ∪ submitted), and a `Button variant="secondary" label="Filters"` carrying a count `Badge` only when filters differ from default.
- Filter surface (phone): `BottomSheet purpose="form" height="capped" label="Filters"` — course as a radio `List` with course colour dots, kind chips (`ToggleButtonGroup`), the full seven-value status list, and a pinned footer with `Reset` + `Show N results` (primary). Desktop: the same state rendered inline in a `LayoutPanel` sidebar.
- Results: `List density="compact"` grouped by week with sticky `Text type="label"` headers. Row = title, `description="courseName · category"`, `end` = `Timestamp format="date_weekday"` + `scoreLabel()` in tabular numerals. Only `missing` and `late` get a `Badge`; HW/Test/Project become a `StatusDot` mark or supporting text.
- Counter "N of M" becomes `Text type="supporting"` under the controls.
- New pure function `applyFilters(assignments, {status, kind, course})` in `lib/filters.ts` with tests (today's predicate is inline in `Assignments.tsx`).
- Empty: `EmptyState title="No assignments match" description="Try widening the status or course filter." actions={<Button label="Reset filters"/>}`.

### 3.3 Assignment detail — `/s/:studentId/assignments/:assignmentId`

Phone: `BottomSheet purpose="info" height="capped" snapPoints={[0.5, 0.92]}`; desktop: `Dialog`. Content: `Heading level={2}` title; course row with colour dot and teacher; facts `List` (Due · Status · Score with `ProgressBar` when graded · Category · First seen / Last seen `Timestamp`); attachments as link `ListItem`s; actions `Email teacher` (`mailto([course.teacherEmail], {subject: title})`) and `Open in HAC` when `sourceUrl` exists. Reuses `scoreLabel`, `mailto`, `gradeTone` for the percentage colour.

### 3.4 Grades — `/s/:studentId/grades`

`List density="spacious"`, one row per course in period order: course dot, name, teacher as description, `end` = average at `Heading level={4}` size in the `gradeTone()` colour plus a delta from the latest `average_changed` event ("+2.1" in success text, "−3.4" in error text). Marking period shown once in the `Section` header. Tap → Assignments with `?course=`. Reuses `gradeTone`.

### 3.5 Teachers & contacts — `/s/:studentId/teachers`

- Action row: `Stack` of full-width `Button`s on phone — `Email all teachers (N)` (primary, bcc list), `Email front office`, `Call front office` (`tel:`).
- `Section "Teachers"`: `List` of `groupTeachers()` rows — `Avatar` initials tinted by the first course's colour, teacher name, description `"P1 · Math · Rm 204"`, `end` = `IconButton` mail (44px).
- **Teacher links** (`family.teacherLinks`, via `linksFor(links, email)`): a compact `Link` row under the description — `Website ↗ · Classroom ↗ · Syllabus ↗` — labelled by `kind` (`KIND_LABEL`) or the harvested `label`, opening in a new tab. Never in the end slot: on a 390px phone the mail button and two link buttons collide in the current app. No link on file → a muted `Find site ↗` using `findSiteUrl()` (the Example ISD Google-Sites search). Tapping the teacher's name opens a **teacher sheet** (`BottomSheet height="hug"`): every course they teach, every link with its provenance (`evidence` → `Text type="supporting"` "Seen in: Welcome to 7th grade Science"; `source: "manual"` → a neutral `Badge` "manual", the only badge here), and the Email action. That is where the current `title=` tooltip's information becomes reachable on touch.
- `Collapsible "Advisory & lunch"` for rows the `/lunch|advisory/i` filter removed; `Section "School contacts"` with mail + tel buttons.
- Reuses `mailto`, `groupTeachers`, `linksFor`, `findSiteUrl`; the skip regex moves to `lib/contacts.ts`.

### 3.6 Activity — `/activity`

Family-wide day-grouped `List`. Row: `start` = student `Avatar` (categorical), title and detail from `describeChange()` (`grade_posted` → "Math · Quiz 3 · 18/20", `average_changed` → "Science 88.4 → 91.0", `assignment_missing` → title + course), `end` = `Timestamp format="relative" isLive`. `SegmentedControl` **All · Grades · Missing · Messages · System**. `run_failed` / `reauth_needed` rows carry `StatusDot variant="error"`. Desktop: single 720px column. This is the Telegram Mini App landing screen.

### 3.7 Freshness and system status

- **Banner slot on AppShell:** `Banner status="error" collapsible={false}` when the latest run of any adapter failed with a re-auth error or an unresolved `reauth_needed` event is < 24h old — copy: "HAC login expired. Sign in again on the collector to resume updates." with a link to `/status`. `Banner status="warning" collapsible` when any adapter is stale (> 2× the 30-min interval). No banner when healthy.
- **TopNav `endContent`:** one worst-of `StatusDot` with a visible label ("Fresh · 12m" / "Stale · 3h" / "Error") → `/status`.
- **`/status`:** `List` of adapters — `StatusDot` + `Timestamp relative` + counts + warnings; `Skeleton` while loading. Replaces the tooltip that touch users cannot open. Adapters now include **Links** (the mail harvester on its own `skoolie-links.timer`, source `links`) with counts `teachers · messages scanned · links added`; it runs on a slower cadence than HAC, so `summarizeRuns()` takes a per-adapter interval rather than one global 30 minutes.
- New pure `summarizeRuns(runs, intervalMin) → {perAdapter, worst}` in `lib/freshness.ts` with tests, extracted from `Freshness.tsx`.

### 3.8 Sign-in and gated states

`AppShell variant="wash"` with a centred `EmptyState`: signed-out → brand heading, supporting line, `Button variant="primary"` "Continue with Google" or "Continue with Telegram" from `detectProvider().kind`; not allow-listed → the signed-in email, "Ask the family admin to add you", secondary "Sign out"; Firestore/auth errors → `Banner status="error"` above the content, never a red paragraph.

### 3.9 Loading and empty copy

| Screen | Loading | Empty |
|---|---|---|
| Home / attention | 5 staggered `Skeleton` rows | "All caught up — nothing missing or due today 🎉" |
| This week | same | "No homework or tests due this week" |
| Assignments | 8 rows | "No assignments match" + Reset |
| Grades | 6 rows | "No averages yet this marking period" |
| Activity | 8 rows | "Nothing has changed since the last check" |
| Attendance | calendar skeleton | "No absences recorded" |
| Tests | 2 collapsible skeletons | "No test scores posted yet" |
| Messages | 5 rows | "No school messages yet" |
| Status | 3 rows | never empty (always at least one run, or "Collector has not run yet") |

### 3.10 Charts, figures and motion

Charts were an anti-goal in the first draft; they are in scope now, on two conditions: every chart follows the dataviz method (form first, colour last, validated, with a table-view twin), and motion is token-driven and restrained.

**Library.** Astryx ships no chart component; its own dashboard templates use **Recharts** (`npx astryx template dashboard`) styled through `--color-data-*` tokens, with `useTheme()` for values Recharts needs in JS. We do the same. Meters use Astryx's `ProgressBar` (it has `marks` for targets), attendance uses `Calendar`. No second charting library.

**Forms — chosen by the data's job, not by what looks impressive.**

| Where | Data's job | Form | Colour job |
|---|---|---|---|
| Home · Grades tiles, family overview | one current value + trend | **Stat tile**: value (proportional figures), signed delta vs last marking period, 12-point sparkline | emphasis: line in `--color-data-neutral`, current period in accent |
| Home · "This week" header | how heavy is each day | **7-column load strip** (assignments due per day), ≤ 24px columns, 4px rounded caps | emphasis: today in accent, other days in `--color-data-neutral` |
| Grades · every course row | trend of the running average | **Sparkline** (small multiple per row) — 2px accent line, 8px end-dot with a 2px surface ring, no axes | one hue |
| Course detail (tap a Grades row) | change over time | **Single-series line** of the running average with hairline gridlines, a solid hairline reference at the `gradeTone` "good" threshold (90), crosshair + tooltip listing the assignment that moved it, endpoint label | one hue + neutral reference |
| Course detail · categories | score vs weight per category | **Meters**: `ProgressBar` per category with `marks=[{value: 90, label: "Good"}]`, same-ramp track | status by `gradeTone()` |
| Attendance | a ratio against a limit + which days | **Meter** (`ProgressBar variant="success"`, mark at 90 = the state truancy threshold) + **month grid** (`Calendar`) with day markers | status (present / tardy / absent) — icon + label, never colour alone |
| STAAR | scale score vs cut points | **Meter per subject** with `marks` at Approaches / Meets / Masters | status; no comparison between subjects |
| Activity | — | no chart; the feed is the record | — |

Not built: multi-line course comparisons, pies, donuts, dual axes. A parent asking "how is Science trending?" gets one line; "which course is worst?" is answered by the Grades list, sorted.

**Colour, validated with the dataviz validator (`scripts/validate_palette.js`) against the skoolie surfaces.**

- Single-series marks wear the accent: `#3950D3` on white 6.44:1, `#B7C4FF` on `#181D26` 9.94:1. Context marks wear `--color-data-neutral` (`#8494A3` / `#8C939B`: 3.11:1 / 5.44:1).
- The five course identity hues **fail** as a chart palette in both modes (avatar tokens are outside the lightness band and pink↔teal is CVD ΔE 1.3; Astryx's `--color-data-categorical-*` counterparts in the same order still fail at pink↔teal ΔE 5.2, and dark-mode purple sits at 2.6:1). This is why the design has no five-series chart, not a palette to fix.
- If a chart ever needs two or three series (e.g. two kids on the family overview), the set is `--color-data-categorical-orange → teal → purple` — validated all-pairs: light mode passes every check (worst CVD ΔE 16.3, normal-vision 27.8, all ≥ 3:1); in dark mode orange + teal pass clean, and the third slot (purple `#6B1EFD`, 2.6:1 on `#181D26`) is legal only with direct labels, and Astryx's mode-invariant data tokens sit a hair outside the dark lightness band (orange L 0.677 vs the 0.67 cap). Practical rule: two series by default, three only with labels — with a legend and direct labels, and "colour follows the entity": a kid keeps their hue when the other is filtered out.
- Sequential (attendance density, if ever) uses Astryx's `--color-data-blue-2…5` ramp; the ordinal check flags `blue-2` at 1.98:1 on white, so ramps start at `blue-3`.
- Status colours are the theme's `--color-success/warning/error`, never reused as series.

**Marks & chrome** (from the method, fixed): 2px lines, ≥ 8px end markers with a 2px surface ring, ≤ 24px bars with 4px rounded data-ends, 10% area washes, solid 1px hairline grid one step off the surface, text always in text tokens, a legend only for ≥ 2 series, selective direct labels (endpoint and extreme only). Every chart has a table-view twin — for grades it is the graded-assignments list that already exists. Crosshair + tooltip on the line chart; per-mark tooltip on columns; the tooltip never gates a value.

**Motion — every duration and easing is an Astryx token, and reduced-motion is honoured by the components.**

| Moment | Mechanism | Tempo |
|---|---|---|
| A new row arrives from a live Firestore snapshot (assignment, change event) | `useEntryAnimation('slideDown')` — it only animates elements inserted after first paint, which is exactly this case | fast |
| An item flips to Missing / Due today | badge mounts with `useEntryAnimation('scaleIn')` | fast |
| Collector run in progress | header `StatusDot isPulsing` — the one pulse in the app; off under reduced motion by the component | — |
| Average changes on the Grades row | number tweens old → new (a 20-line hook reading `--duration-medium` / `--ease-standard` from `useTheme()`; instant under reduced motion) | medium |
| Course detail opens | the line draws on once (Recharts `animationDuration` = `--duration-medium`); sparklines never animate (`isAnimationActive={false}`, as Astryx's own template does) | medium |
| Sheets, drawer, tab indicator, skeleton shimmer, collapsibles | Astryx built-ins | as shipped |
| Refetch | hold the previous chart at reduced opacity — no skeleton, no layout jump | fast |
| "All caught up" empty state (optional flourish) | a single-line self-drawing check mark (the `lineart-lottie` pipeline: draw-on once, no breathing loop), sized like the icon it replaces | ≈ 1.5 s, once |

Not done: parallax, scroll-triggered reveals, hover choreography on rows (Astryx explicitly warns against animating high-frequency interactions), confetti.

## 4. Theme spec — `skoolie`

Full sketch in `docs/astryx-redesign-theme.ts`. Build check: `npx astryx theme build` against `@astryxdesign/core` 0.5.0 + `@astryxdesign/theme-neutral` 0.5.0 succeeded on 2026-08-27 (paper-and-ink revision) — CSS / JS / d.ts emitted, 1 type augmentation. The only warnings were the expected "fonts named but not loaded" notices, which the app resolves by loading Nunito itself.

### 4.1 Base and accent — "ruled paper and ink"

The first draft (butter base, coral accent, radius ×1.25) was rejected in review as the templated warm-cream look. The replacement is grounded in school's own materials rather than a café palette:

- **Extends `neutralTheme`** (`@astryxdesign/theme-neutral`, the maintained default) with `neutralStyle: 'cool'` — restrained greys that keep content in focus.
- **Ground:** a cool paper-white `#F3F5F8` with the faint blue-grey of ruled paper (not cream); surfaces pure white. Night mode is deep ink `#0F1319` / `#181D26`, not black.
- **Accent seed fountain-pen blue `#2A48C9` (light) / `#9DB1FF` (dark).** The one colour every school notebook already carries. **Finding from the build:** the HCT generator re-tones the seed to `#3950D3` (light) / `#B7C4FF` (dark) to hold ≥ 4.5:1 as text; accepted, and the mockups use the resolved values. `--color-on-accent` is white / deep ink (6.44:1 / 10.8:1).
- **Status from the same desk:** margin-line red `#B8232F` for Missing/Late, pencil ochre `#8A5A00` for Due today, slate green `#1F6B45` for good grades — all measured, none derived.
- **Kids get the warmth:** categorical `orange → purple → teal → pink → cyan`, so a child's avatar and rail pop against the cool ground. `blue` is excluded because it is the accent.
- `contrast: 'standard'`; a high-contrast toggle can come later through a nested `<Theme>` in Settings.

### 4.2 Typography

`scale: {base: 17, ratio: 1.2}` → body 17px, supporting ≈ 14px, label ≈ 14px, headings 20 / 24 / 29 / 35px. Body and headings in **Nunito** (variable, weights 400–800) loaded via `@fontsource-variable/nunito`, fallbacks `Figtree, -apple-system, system-ui, sans-serif`. Nunito was chosen over Atkinson Hyperlegible for its rounded, friendly forms while keeping tabular figures; Atkinson stays the alternate if readability complaints appear. Scores and averages use `font-variant-numeric: tabular-nums` through a `text` component override.

### 4.3 Shape and motion

`radius: {base: 4, multiplier: 1}` → Astryx's defaults inner 4 / element 8 / container 12 / page 28: crisp rather than bubbly — the ×1.25 of the first draft contributed to the templated feel and was reverted. Avatars and badges use `--radius-full`. Motion keeps Astryx defaults (175 / 410 / 975 ms, `cubic-bezier(.24, 1, .4, 1)`); components honour `prefers-reduced-motion` themselves; `BottomSheet` uses the medium tempo.

### 4.4 Token overrides (light / dark)

| Token | Light | Dark | Why |
|---|---|---|---|
| `--color-accent` | `#3950D3` (seed `#2A48C9`) | `#B7C4FF` (seed `#9DB1FF`) | generated from `color.accent`; see §4.1 |
| `--color-on-accent` | `#FFFFFF` | `#0B1230` | label on ink in each mode |
| `--color-background-body` | `#F3F5F8` | `#0F1319` | ruled paper / night ink |
| `--color-background-surface` | `#FFFFFF` | `#181D26` | rows and sheets |
| `--color-error` | `#B8232F` | `#FF8B8B` | Missing / Late / re-auth |
| `--color-warning` | `#8A5A00` | `#F2C14E` | Due today / stale |
| `--color-success` | `#1F6B45` | `#6CCB94` | good grades / fresh |
| `--color-on-error` / `-warning` / `-success` | `#FFFFFF` | `#3A0006` / `#2A1B00` / `#04240F` | badge labels; neutral's inherited on-colours are not tuned for these hues |

Explicit dark values are written rather than relying on derivation because "dark mode required" is a hard constraint. Astryx's neutral theme supplies mode-adaptive categorical tokens, so nothing needs overriding there.

### 4.5 Colour semantics and badge discipline

| Meaning | Treatment |
|---|---|
| `status = missing` | `Badge variant="error" label="Missing"` |
| `status = late` | `Badge variant="error" label="Late"` |
| due today | `Badge variant="warning" label="Due today"` |
| `upcoming`, `unknown`, `submitted` | no badge — plain row |
| `graded` | score text only (`scoreLabel()`), tabular |
| `excused` | `Text type="supporting"` "Excused" |
| kind HW / Test / Project | `StatusDot` mark with icon or supporting text — never a badge |
| `gradeTone()` good / ok / warn / bad | text in `--color-success` / `--color-text-primary` / `--color-warning` / `--color-error` |
| freshness good / stale / bad | `StatusDot` success / warning / error, always labelled |
| message with open action items | `Badge variant="warning" label="Action needed"` |
| student / course identity | categorical `blue · purple · teal · pink · cyan` only |

Astryx's rule is that every badge steals attention, so only exceptions that need a parent's action get one. Today's app badges the default (HW) and hides the exception (missing) in a class name — the redesign inverts that.

### 4.6 Contrast check — measured from the built CSS (2026-08-27, paper-and-ink revision)

WCAG 2.x ratios computed from the resolved `light-dark()` values in the built `skoolie.css` (alpha tokens composited over the surface). Every pair passes on the first build of this palette.

| Pair | Light | Dark | Target |
|---|---|---|---|
| accent text on body | 5.89 | 10.96 | ≥ 4.5 |
| on-accent on accent (primary button) | 6.44 | 10.80 | ≥ 4.5 |
| text-primary on surface | 17.10 | 13.10 | ≥ 4.5 |
| text-secondary on surface | 9.37 | 7.34 | ≥ 4.5 |
| error text on surface | 6.33 | 7.50 | ≥ 4.5 |
| warning text on surface | 5.93 | 10.07 | ≥ 4.5 |
| success text on surface | 6.47 | 8.54 | ≥ 4.5 |
| on-error / on-warning / on-success on their fills (Badge) | 6.33 / 5.93 / 6.47 | 7.88 / 9.97 / 8.39 | ≥ 4.5 |
| border-emphasized on surface | 3.17 | 3.02 | ≥ 3 |
| orange / purple / teal / pink / cyan avatar text on their backgrounds | 6.25–7.26 | 6.81–6.91 | ≥ 4.5 |

Observation for P1: unlike butter, the neutral theme's categorical tokens are light/dark adaptive (e.g. orange text `#6e3500` → `#ffc9a2`), so avatars sit correctly on dark surfaces without overrides. Dark `border-emphasized` is at the 3:1 floor; nudge it if hairlines look faint on real devices.

### 4.7 Mode switching and delivery

- `<Theme theme={skoolieTheme} mode={member.prefs.theme ?? 'system'}>` in `main.tsx`; Settings writes `light | dark | system` to `Member.prefs.theme` (schema addition in `@skoolie/shared`, additive).
- Telegram Mini App maps `WebApp.colorScheme` to `mode` and calls `expand()` on load.
- Production: `astryx theme build src/theme.ts` in a `prebuild` script emits `skoolie.css` / `.js` / `.d.ts`; the app imports the built module + CSS so there is no style flash and custom variants are typed. Runtime injection stays for dev.

## 5. Accessibility and mobile specifics

- **Touch targets:** `list-item` min-height 48px and `button` min-height 44px via component overrides; end-slot icon buttons 44px.
- **Type floor:** supporting text ≈ 14px at 17 × 1.2; nothing below 14px.
- **Motion:** no custom animation; `StatusDot isPulsing` only while a collector run is in progress, and the component disables it under reduced motion.
- **Colour never alone:** every `StatusDot` has a `label`; badges carry text; grade colour is paired with the number.
- **Semantics:** primary nav is a `TabList` nav landmark with `aria-current`; the Assignments status control is a `SegmentedControl` (radio-group semantics). `AppShell` owns the skip link and `<main>`; each page renders its own `Heading level={1}`.
- **Sheets and keyboards:** filter sheets are `purpose="form" height="capped"` with the primary action pinned; only text-entry sheets use `height="tall"` (the only height that accommodates the on-screen keyboard).
- **Safe areas:** `viewport-fit=cover` is already set; the sticky `TabList` and pinned sheet footers add `env(safe-area-inset-*)` padding through `contentPadding` / `Section` padding.
- **PWA:** add 192 / 512 maskable icons (coral rounded square, white "s"), `apple-touch-icon`, paired `<meta name="theme-color" media="(prefers-color-scheme: …)">`, update `background_color` / `theme_color` in the manifest to the new body / accent values.
- **Telegram:** hide "Sign out" inside the Mini App; honour `colorScheme`.

## 6. Roadmap (input to a later execution plan)

| Phase | Work | Exit gate |
|---|---|---|
| **P0 Tooling** | Add `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@stylexjs/stylex` + the StyleX Vite plugin (verify Vite 8 support), `react-router`, `recharts`, `@fontsource-variable/nunito`; `npx @astryxdesign/cli init --features agents` writes `CLAUDE.md` for `apps/web` | `pnpm --filter @skoolie/web build` green with one Astryx `Button` rendered |
| **P1 Theme** | `src/theme.ts` from the sketch, `prebuild` theme build, fonts loaded, §4.6 contrast table filled | built CSS committed; both modes screenshotted |
| **P2 Shell + routing** | `AppShell`, `TopNav`, `TabList`, `SideNav` / `MobileNav`, router + `useLinkComponent`, student switcher, gated states, freshness banner + dot; move pure functions to `lib/` | `pnpm verify` green; all three existing screens reachable by URL |
| **P3 Screens** | Home, Assignments (+ filter sheet, detail sheet), Grades, Teachers | parity checklist: every current bucket still visible somewhere |
| **P4 New surfaces + charts** | Activity, Status, Messages, Attendance, Tests, Calendar; sparklines, load strip, course-detail line, meters (`recharts`, `useTheme()`); new hooks; `describeChange`, `summarizeRuns`, `applyFilters`, `runningAverage` with tests; palette re-validated with `validate_palette.js` against the built CSS | `pnpm verify` green; screens render empty states with no data |
| **P5 Polish** | PWA icons, Settings (mode, student colours), Telegram mode, optional Playwright screenshots at 390 / 1280 × light / dark | bundle budget met (< 250 kB gz JS excluding Firebase) |

Every phase runs `pnpm verify` (`.claude/verify.sh`), `astryx theme build`, and a `vite build` size report.

**Risks**

- Astryx 0.5.0 is Beta with visible API churn in its changelog (renames in 0.1.2, 0.3.0, 0.4.0). Pin the exact version and wrap the shell in one thin `AppFrame` component so nav API changes stay local.
- StyleX + Vite 8 plugin maturity; fallback is pinning Vite 7 or using Astryx's built-CSS path.
- Bundle size of Astryx + StyleX runtime for a very small app — measure in P0.
- Runtime vs built theme: component overrides flash on hydration when not built; always build for production.
- Moving pure functions to `lib/` changes test imports — mechanical, but do it in P2 with the tests.

## 7. Mockups

`docs/astryx-redesign-mockups.html` renders seven 390×844 phone frames, each in light and dark, plus one 1280px desktop Home: Home · Assignments with the filter sheet open · Assignment detail sheet · Grades · Activity · Teachers · Re-auth banner + Status. Sign-in and skeleton states appear in a short strip; a Course detail frame carries the trend chart and meters, an Attendance & tests frame the month grid and STAAR meters, and a Motion strip demonstrates the four microanimations (respecting `prefers-reduced-motion`). The page defines the theme as CSS variables mirroring §4 and names its classes after the Astryx components they stand for (`.ax-list-item`, `.ax-badge--error`, `.ax-status-dot`, `.ax-banner`, `.ax-bottom-sheet`, `.ax-tablist`) so the mockup vocabulary matches the code plan. Spacing and exact colours are approximations of the neutral-derived tokens; the built theme is the source of truth.

## 8. Open questions

1. Keep "Recently graded" on Home, or trust the Activity feed to carry it?
2. Default mode: follow the system (recommended) or dark-first?
3. Should the future `student` role get a stripped Home (Missing + Due today only)? It affects route guards now.
4. Is a Playwright screenshot gate (390 / 1280 × light / dark) worth adding in P5, or keep visual checks manual?
5. If thumb-zone reach turns out to matter in daily use, revisit a custom bottom bar — it is the one place this proposal would leave Astryx idioms.


## 9. Implementation notes (2026-08-27)

Everything in §2–§5 is built as specified; this section records what the first pass had departed from and how each was resolved, plus the one real constraint found in Astryx 0.5.0.

**Delivered.** Every route in §2.2, the shell (`AppShell` + `TopNav` identity pill + phone `TabList` + `SideNav`/drawer + freshness chip + re-auth / stale banners), the student switcher, gated states, the `skoolie` theme (built artifacts `src/skoolie.{css,js,d.ts}` are committed; `pnpm --filter @skoolie/web theme:build` regenerates them and `prebuild` runs it), all four "new surface" screens, the charts (sparklines, load strip, running-average line, category / attendance / STAAR meters), the motion table in §3.10 (entry animation on live-inserted rows, badge tone easing, value tween on averages, `StatusDot isPulsing` while a run is in progress, line draw-on once, self-drawing check mark on "All caught up"), and PWA icons. Pure functions live in `apps/web/src/lib/*` with tests; `pnpm verify` is green (74 web tests + rules tests incl. the dotted `prefs.*` write).

**Resolved (proposal → code).**

| Topic | How it is done |
|---|---|
| Data-viz tokens | Astryx 0.5.0 defines `--color-data-*` as *domain* tokens with runtime defaults, but a **built** theme skips runtime injection, so they never reached the page. The theme now sets `--color-data-neutral`, `--color-data-categorical-orange/teal/purple` and `--color-data-blue-1…5` explicitly (Astryx's own values, validated in §3.10); context marks use `--color-data-neutral`, the series uses the accent. |
| `Member.prefs.theme` | `theme` and `lastStudentId` added to `Member.prefs` in `@skoolie/shared` (additive, optional). The web app writes them with dotted-path `updateDoc` (rules already allow a member to change only `prefs`; a rules test covers the dotted write). localStorage is only a first-paint cache. Telegram's `colorScheme` still wins. |
| StyleX | `@stylexjs/unplugin` compiles StyleX in the Vite 8 build (verified: styles land in the CSS asset; dev uses the plugin's virtual runtime). Component styling goes through `xstyle` / `stylex.props` from `src/ui/styles.ts`; `styles.css` keeps only the document ground and SVG chart marks, which are not components. |
| Router link | `LinkProvider component={RouterLink}` is the public API for what the proposal called `useLinkComponent()`; `Tab`, `SideNavItem`, `ListItem`, `Button` and `Link` all render router anchors, external / `mailto:` / `tel:` stay plain. |
| Row dates | `Timestamp format="date_weekday"` on desktop as specified; phones show `EEE M/d` because "Thu, Sep 3, 2026" does not fit beside a score at 390px. |
| Tabs | `TabList layout="fill" size="sm"` plus a `tab` component override (tighter inline padding) so the five labels fit 390px — verified by screenshot. |
| Bundle | Initial JS for Home ≈ **235 kB gz excluding Firebase** (index 109 + Button/Astryx core 41 + shared 30 + rows/sheets/tooltips ~55). Under the 250 kB target once Recharts (107 kB, first course sheet), Markdown (30 kB, Messages) and the drawer-only pages became lazy chunks. Firebase is 157 kB. |
| Playwright gate | In the repo: `pnpm --filter @skoolie/web shots` builds the demo bundle, serves it, screenshots 16 routes × phone/desktop × light/dark into `apps/web/shots/` (gitignored) and fails on any page error or horizontal overflow. Not part of `verify` (needs a Chromium: `pnpm exec playwright install chromium`). |

**Constraint, not a departure.** Attendance uses a 7-column grid (`.sk-month`) rather than Astryx `Calendar`: in 0.5.0 `Calendar` is a date picker whose day marker state (`data-marker`) has no public prop, so it cannot show absences. Swap it in when a marker API ships.

**Added beyond the proposal.** `VITE_DEMO=1` renders the whole app on fixture data (`src/demo.ts`) with auth skipped — used by the screenshot gate and for developing without a Firebase project. Family overview (`/?all`) with one tile per kid; a bare `/` returns to the last-used student (synced through `prefs.lastStudentId`).

**Open questions §8** still stand; the implementation keeps "Recently graded" out of Home (it lives in Activity) and follows the system colour scheme by default.
