Wrap every shell command with timeout.
Use the GNU coreutils timeout wrapper for all long-running or potentially flaky commands.

# Examples (Linux/macOS)
timeout 600 npm test --silent
timeout 120 npm run build
timeout 30  node scripts/check-env.js


If a job is expected to be longer, prefer staged timeouts (e.g., timeout 120 for lint, timeout 600 for tests, timeout 180 for typecheck) rather than a single huge value.

Never add --forceExit to Jest by default.
Prefer discovering leaks over papering them over. Only use --detectOpenHandles for a one-off diagnostic run (also behind timeout), then fix the underlying issue.
# One-off diagnostic (not default CI)
timeout 900 npx jest --detectOpenHandles --logHeapUsage


Fail fast, report clearly.
If a timeout kills a process, treat it as a failure. Surface:

command + args

elapsed seconds

last 200 lines of output

exit code (124 indicates timeout)

Standard Commands (with timeouts)

Install
timeout 300 npm ci (or pnpm install --frozen-lockfile / yarn --immutable)

Typecheck
timeout 300 npm run typecheck
(If TypeScript via JSDoc, keep it, but still time-box.)

Lint
timeout 180 npm run lint

Format (check only)
timeout 60 npm run fmt:check || true
(Don’t block the agent on formatting; suggest a follow-up fix step.)

Unit tests
timeout 600 npm test --silent
If Jest: add CI=1 and cap workers:
timeout 600 env CI=1 npm test -- --maxWorkers=50%

Build
timeout 300 npm run build

Rationale: Node projects often leave open handles (servers, timers, watchers). Without timeout, agents can hang indefinitely. This repo’s work cadence already emphasizes stable, small steps and clean CI runs; enforcing timeboxes aligns with that.

Retries (when appropriate)

Use at most one exponential backoff retry for clearly transient failures (registry hiccups, rate limits):

# Pseudo:
try: timeout 120 npm ci
catch transient: sleep 5 && timeout 180 npm ci


Do not retry deterministic failures (type errors, lints, failing tests).

Node/Jest Quirks Policy

Prefer fixing open-handle leaks (dangling servers, unawaited promises).

For server tests, ensure explicit close in afterAll.

Avoid global timers without teardown.

Keep Jest’s default exit; don’t rely on --forceExit.

Long-Running Scripts

Any script that starts a dev server, watcher, or tailing process must be run behind timeout and, if needed, with --once/“non-watch” flags.

If there’s no “non-watch” mode, agents must not run it outside a dedicated diagnostic step (still time-boxed).

Logging & Artifacts

On failure, agents should attach:

artifact:logs/<cmd>.<timestamp>.log (last 2k lines)

A plain-English summary with suggested next action (“tests exceeded 600s; likely open handle in X”)

Project-Specific Notes

Import adapters & pagination: prefer running unit tests for detection/normalization first; integration-style tests are last and still wrapped in timeout.

Docs work: when adding/refreshing docs (README, ORIENTATION.md, AGENTS.md), run only lint/format + link checks (all time-boxed). 

Safe Defaults Checklist (agents)

 Use timeout for every command.

 Set CI=1 for tests.

 Cap Jest workers to avoid thrash (--maxWorkers=50%).

 No --forceExit unless explicitly asked for a one-off diagnostic.

 On timeout: capture logs, exit non-zero, and propose next steps.

 Keep changes atomic; follow conventional commits.