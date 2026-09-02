## What and why

<!-- What changes, and what you observed that motivated it. For parser fixes, say what your
district's markup does differently. -->

## Checklist

- [ ] `pnpm verify` is green
- [ ] New logic has tests beside it
- [ ] No real student data anywhere in the diff — fixtures, tests, and screenshots are all synthetic
- [ ] Rules changes come with a rules test; schema changes update `packages/shared` and both sides
- [ ] Theme changes include the regenerated `apps/web/src/skoolie.{css,js,d.ts}`
