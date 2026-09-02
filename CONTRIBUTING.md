# Contributing

Thanks for looking. This started as one family's dashboard, so a lot of it is shaped by one
district's Home Access Center. Making it work for yours is the most useful thing you can do with it.

## Before you open an issue or PR

**Never attach real student data.** No dumps from `--dump`, no screenshots of a real dashboard, no
Firestore exports, no HAC HTML with a real name, ID, teacher, or school in it. If a bug needs markup
to reproduce, hand-scrub it into a synthetic fixture first — invented names, invented IDs, invented
school. Every fixture in `services/collector/fixtures/` is synthetic and must stay that way. See
[SECURITY.md](SECURITY.md) if the bug itself is a data-exposure problem.

## Getting set up

```bash
pnpm install
pnpm verify              # typecheck + unit tests + Firestore rules tests
VITE_DEMO=1 pnpm dev:web # the whole UI on fixture data — no Firebase project needed
```

`pnpm verify` needs a JRE for the Firestore emulator (`brew install openjdk@21` on macOS). It is the
gate: **get it green before you call a change done.** `pnpm verify:full` adds mutation testing and
the Playwright e2e suite; CI runs all three.

## What's especially welcome

- **Districts whose HAC markup differs.** The selectors in
  `services/collector/src/adapters/hac/parse.ts` come from stock HAC. If yours is skinned
  differently, a fix plus a synthetic fixture reproducing your markup is a great PR — the fixture is
  what keeps it from regressing.
- **Adapters for other student information systems.** Nothing outside `adapters/hac/` knows HAC
  exists; adapters produce the zod-validated shapes in `packages/shared`, and the diff, sink, and UI
  work from those. A new adapter should not need to change anything downstream.
- **Accessibility and small-screen fixes.** The dashboard is used on a phone more than anywhere else.

## How the code is organized

- `packages/shared` — zod schemas for every Firestore document. This is the contract between the
  collector and the UI; change it and both sides must follow.
- `services/collector` — adapters, normalizer, diff, Firestore sink, CLI. Plain HTTP and cheerio, no
  browser, for the HAC path.
- `apps/web` — React + Vite on Meta's Astryx design system. Pure logic lives in `src/lib/` with unit
  tests beside it; components stay thin.
- `firebase/` — security rules and their tests. Any change to who can read what needs a rules test.

## Conventions

- **TypeScript strict, no `any`.** If a type is hard, that usually means the schema is wrong.
- **Tests next to the code**, `foo.ts` / `foo.test.ts`. New logic in `lib/` or the collector should
  come with tests; mutation testing (`pnpm mutate`) covers those directories, so tests that assert
  nothing will show up.
- **Never assert against ambient `import.meta.env`.** Vite loads your `apps/web/.env` during tests,
  and modules like `tz.ts` and `grades.ts` read the environment once at import time. A test that
  asserts a timezone or a HAC URL without stubbing passes for whoever wrote it and fails for everyone
  configured differently. Stub with `vi.stubEnv` + `vi.resetModules()` and a dynamic `import()`, and
  put the cleanup in `afterEach` so a failed assertion can't leak it into the next test.
  `pnpm --filter @skoolie/web test:env` runs the suite across several configurations and is the check
  that catches this; CI runs it too.
- **Style follows the file you're in** — match the surrounding naming, comment density and idiom
  rather than introducing a new house style.
- **Comments explain why, not what.** The ones worth writing are the ones about HAC's or Graph's
  behavior that you would otherwise have to rediscover.
- Theme changes go through `apps/web/src/theme.ts` and `pnpm --filter @skoolie/web theme:build`; the
  generated `skoolie.{css,js,d.ts}` are committed, so regenerate them in the same commit.

## Pull requests

Keep them focused, explain what you observed that motivated the change (especially for
district-specific parser fixes), and say which district or setup you tested against — without naming
real people or schools if you'd rather not. Confirm `pnpm verify` is green.

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
