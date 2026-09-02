#!/usr/bin/env bash
# Fast, deterministic, offline verification entrypoint. Must be green before work is "done".
# Mutation testing and e2e are deliberately NOT here — they take minutes and would make the Stop
# hook useless. Run `pnpm verify:full` for those.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"

pnpm -r --if-present typecheck
pnpm -r --if-present test -- --run --coverage

# Firestore security rules run against the local emulator (needs a JRE; skipped loudly if absent).
if command -v java >/dev/null 2>&1; then
  pnpm --filter @skoolie/firebase test:rules
else
  echo "verify: WARNING no java on PATH — Firestore rules tests skipped (brew install openjdk@21)" >&2
fi
