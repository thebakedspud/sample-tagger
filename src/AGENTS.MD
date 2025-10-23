Wrap every shell command with a timeout. Use the GNU coreutils `timeout` wrapper for anything long-running or potentially flaky.

> Windows note: local PowerShell does not ship with `timeout`. When you need to run these commands manually on Windows, invoke them through WSL (`wsl timeout <secs> <command>`) or use a PowerShell equivalent such as `Start-Job` plus `Wait-Job -Timeout`. CI agents must continue to use GNU `timeout`.

# Examples (Linux/macOS)
timeout 600 npm test --silent
timeout 120 npm run build
timeout 30 node scripts/check-env.js

If a job is expected to be longer, prefer staged limits (for example, timeout 120 for lint, timeout 600 for tests, timeout 180 for typecheck) rather than one huge value.

Never add `--forceExit` to Jest by default. Prefer discovering leaks over papering them over. Only run `--detectOpenHandles` as a one-off diagnostic (still behind `timeout`), then fix the underlying issue.

# One-off diagnostic (not default CI)
timeout 900 npx jest --detectOpenHandles --logHeapUsage

Fail fast, report clearly. If a timeout kills a process, treat it as a failure and surface:

- command + args
- elapsed seconds
- last 200 lines of output
- exit code (124 indicates timeout)

# Standard commands (with timeouts)

Install  
timeout 300 npm ci (or `pnpm install --frozen-lockfile` / `yarn --immutable`)

Typecheck  
timeout 300 npm run typecheck  
(If TypeScript via JSDoc, keep it, but still time-box.)

Lint  
timeout 180 npm run lint

Format (check only)  
timeout 60 npm run fmt:check || true  
(Do not block the agent on formatting; suggest a follow-up fix step.)

Unit tests  
timeout 600 npm test --silent  
If Jest: set `CI=1` and cap workers:  
timeout 600 env CI=1 npm test -- --maxWorkers=50%

Build  
timeout 300 npm run build

Rationale: Node projects often leave open handles (servers, timers, watchers). Without timeouts, agents can hang indefinitely. This repo's cadence already favors small, stable steps and clean CI runs; enforcing timeboxes keeps that discipline.

# Retries (when appropriate)

Use at most one exponential-backoff retry for clearly transient failures (registry hiccups, rate limits):

```
try:    timeout 120 npm ci
catch transient:
    sleep 5
    timeout 180 npm ci
```

Do not retry deterministic failures (type errors, lint issues, failing tests).

# Node/Jest quirks policy

- Prefer fixing open-handle leaks (dangling servers, unawaited promises).
- For server tests, shut down servers explicitly in `afterAll`.
- Avoid global timers without teardown.
- Keep Jest's default exit; do not rely on `--forceExit`.

# Long-running scripts

Any script that starts a dev server, watcher, or tailing process must run behind `timeout` and, when possible, with `--once` or `--non-watch` style flags.

If the script has no non-watch mode, agents must not run it outside a dedicated diagnostic step (still time-boxed).

# Logging & artifacts

On failure, agents should attach:

- `artifact:logs/<cmd>.<timestamp>.log` containing the last 2000 lines
- A short plain-English summary with the suggested next action (for example, "tests exceeded 600s; likely open handle in import flow")

# Project-specific notes

- Import adapters and pagination: run unit tests for detection/normalization first; integration-style tests come last and still run behind `timeout`.
- Docs work: when adding or refreshing docs (README, ORIENTATION.md, AGENTS.MD), run only lint/format and link checks (all time-boxed).

# Safe defaults checklist (agents)

- Use `timeout` for every command.
- Set `CI=1` for tests.
- Cap Jest workers to avoid thrash (`--maxWorkers=50%`).
- Avoid `--forceExit` unless explicitly asked for a diagnostic.
- On timeout: capture logs, exit non-zero, and propose next steps.
- Keep changes atomic; follow conventional commits.
