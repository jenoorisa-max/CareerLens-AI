// Runs the automated regression suite: `npm test` (all) or `npm run test:fast`
// (skips the real-time 75s Gemini budget checks). Each suite prints
// "N passed, M failed"; this runner totals them and fails on any failure or a
// suite that does not finish. No network calls and no Gemini quota are used.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const tsxCli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const fast = process.argv.includes("--fast");

const SUITES = [
  "tests/server/handlers.test.mts",              // Step A: shared handlers, validation, API wrappers
  "tests/server/gemini.test.mts",                // Step B/B2: retries, timeouts, 75s budget, safe errors, logs
  "tests/frontend/api-and-display.test.mts",     // D1: postJSON, score clamping, padding, render
  "tests/frontend/request-coordination.test.mts",// D2 + follow-up: dedupe, sessions, roadmap wait, failures
  "tests/frontend/cooldown.test.mts",            // D3: 15s cooldown after 503/429
  "tests/frontend/session.test.mts",             // D4: session persistence, validator move
  "tests/frontend/shared-profile.test.mts",      // D4 follow-up: shared profile validation, stage numbers
];

const env = { ...process.env };
delete env.GEMINI_API_KEY; // suites must never reach the real Gemini API
delete env.GEMINI_MODEL;

let totalPass = 0, totalFail = 0, broken = 0;
for (const suite of SUITES) {
  const args = [tsxCli, suite, ...(fast ? ["--fast"] : [])];
  const t0 = Date.now();
  const run = spawnSync(process.execPath, args, { cwd: repo, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const summary = out.match(/(\d+) passed, (\d+) failed(.*)/g)?.pop();
  const m = summary?.match(/(\d+) passed, (\d+) failed(.*)/);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!m || m[3].includes("ABORTED") || run.status !== 0 && Number(m[2]) === 0) {
    broken++;
    console.log(`✗ ${suite}  did not complete (exit ${run.status})  ${secs}s`);
    console.log(out.split("\n").slice(-25).join("\n"));
    continue;
  }
  const [p, f] = [Number(m[1]), Number(m[2])];
  totalPass += p; totalFail += f;
  console.log(`${f === 0 ? "✓" : "✗"} ${suite}  ${p} passed, ${f} failed  ${secs}s`);
  if (f > 0) for (const line of out.split("\n")) if (line.startsWith("FAIL")) console.log("    " + line);
}

console.log(`\nTOTAL: ${totalPass} passed, ${totalFail} failed${broken ? `, ${broken} suite(s) did not complete` : ""}${fast ? " (fast mode: real-time budget checks skipped)" : ""}`);
process.exit(totalFail || broken ? 1 : 0);
