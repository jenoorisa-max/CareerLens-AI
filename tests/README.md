# CareerLens AI regression tests

No extra packages: every script runs with `tsx` (already a dev dependency).
No test makes a network call or uses Gemini quota; Gemini is always mocked.

| Command | What it runs |
|---|---|
| `npm test` | All automated suites below (about 3 minutes; includes real-time 75s budget checks) |
| `npm run test:fast` | Same, but skips the real-time timeout/budget checks in `gemini.test.mts` |
| `npm run test:browser` | Real-browser checks in headless Edge/Chrome (needs a Chromium browser; ports 3123 and 9333 free) |

## Automated suites (`npm test`)

| File | Covers |
|---|---|
| `server/handlers.test.mts` | Shared API handlers, input validation, Vercel wrappers (405, malformed JSON) |
| `server/gemini.test.mts` | Gemini retries, 30s/75s timeouts, overload backoff + jitter, safe error messages, log hygiene, response-shape checks |
| `frontend/api-and-display.test.mts` | `postJSON` (non-JSON errors, timeouts), score clamping, number padding |
| `frontend/request-coordination.test.mts` | Duplicate-request reuse, sessions, roadmap waits for skill gap, failure/retry rules, failed new search |
| `frontend/cooldown.test.mts` | Global 15s cooldown after 503/429, persistence across refresh |
| `frontend/session.test.mts` | Session persistence and validation of restored data |
| `frontend/shared-profile.test.mts` | Shared profile validation (golden outputs) and canonical stage numbers |

`fixtures/validate-profile-golden.json` holds the outputs of the original
`validateProfile` (commit 77601fa); regenerate it only if the validation rules
are intentionally changed.

## Browser checks (`npm run test:browser`)

`browser/run-browser-checks.mts` starts the real `server.ts` with Gemini mocked
(`browser/mock-server.mts`), launches a headless browser and runs
`browser/cooldown.browser.mts` and `browser/session.browser.mts`.
Set `BROWSER_PATH` to use a specific browser.
