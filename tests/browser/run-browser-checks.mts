// `npm run test:browser`: real-browser checks in headless Edge/Chrome via the
// Chrome DevTools Protocol (Node's built-in WebSocket, no extra packages).
// Builds the app once, then starts the real server.ts in production mode (serving
// the built bundle, exactly what users get) with Gemini mocked
// (tests/browser/mock-server.mts), so no network calls or quota are used.
// Production mode also means no Vite dev client, so a dev server already running
// on this machine (which owns Vite's HMR port) cannot cause browser errors.
// Set BROWSER_PATH to override the browser. Uses ports 3123 (app) and 9333
// (DevTools); both must be free.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge",
].filter(Boolean) as string[];
const browserPath = CANDIDATES.find((p) => existsSync(p));
if (!browserPath) {
  console.log("No Edge/Chrome found. Set BROWSER_PATH to a Chromium-based browser.");
  process.exit(1);
}

async function waitForUrl(url: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if ((await fetch(url)).ok) return true; } catch { /* not up yet */ } await sleep(500); }
  return false;
}
function killTree(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}
async function closeBrowser() {
  try {
    const { webSocketDebuggerUrl } = await (await fetch("http://127.0.0.1:9333/json/version")).json();
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    await sleep(500);
  } catch { /* already closed */ }
}

async function runCheck(name: string, script: string, mockEnv: Record<string, string>) {
  console.log(`\n=== ${name}`);
  const server = spawn(process.execPath, [tsxCli, "tests/browser/mock-server.mts"], {
    cwd: repo,
    stdio: "ignore",
    env: { ...process.env, GEMINI_API_KEY: "", PORT: "3123", NODE_ENV: "production", ...mockEnv },
  });
  const profileDir = mkdtempSync(join(tmpdir(), "careerlens-browser-"));
  let browser: ChildProcess | undefined;
  try {
    if (!(await waitForUrl("http://localhost:3123/api/health", 60_000))) throw new Error("mock server did not start on :3123");
    browser = spawn(browserPath!, ["--headless=new", "--remote-debugging-port=9333", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", `--user-data-dir=${profileDir}`, "about:blank"], { stdio: "ignore" });
    if (!(await waitForUrl("http://127.0.0.1:9333/json/version", 30_000))) throw new Error("browser DevTools did not start on :9333");
    const run = spawnSync(process.execPath, [tsxCli, script], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    process.stdout.write(run.stdout + run.stderr);
    return run.status === 0;
  } catch (e) {
    console.log("FAIL  " + (e as Error).message);
    return false;
  } finally {
    await closeBrowser();
    if (browser) killTree(browser);
    killTree(server);
    await sleep(1000);
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* browser may still hold files briefly */ }
  }
}

console.log(`Browser: ${browserPath}`);
// Build the current source so the checks always run against up-to-date code.
const viteCli = fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url));
const build = spawnSync(process.execPath, [viteCli, "build", "--logLevel", "warn"], { cwd: repo, encoding: "utf8" });
if (build.status !== 0) {
  console.log("FAIL  production build failed\n" + build.stdout + build.stderr);
  process.exit(1);
}
console.log("Production build ready (dist/).");
const ok1 = await runCheck("D3 cooldown (skill gap mocked as 503)", "tests/browser/cooldown.browser.mts", {});
const ok2 = await runCheck("D4 session persistence (all mocked as 200)", "tests/browser/session.browser.mts", { MOCK_SKILLGAP: "ok" });
const ok3 = await runCheck("Career Finder input limits", "tests/browser/form-limits.browser.mts", { MOCK_SKILLGAP: "ok" });
const ok4 = await runCheck("Landing Page and navigation", "tests/browser/landing.browser.mts", { MOCK_SKILLGAP: "ok" });
const ok5 = await runCheck("Dashboard and app navigation", "tests/browser/dashboard.browser.mts", { MOCK_SKILLGAP: "ok" });
const ok6 = await runCheck("Career Finder flow (responses delayed 1.5s)", "tests/browser/career-finder.browser.mts", { MOCK_SKILLGAP: "ok", MOCK_DELAY_MS: "1500" });
const ok7 = await runCheck("Career Finder error state (career search rejected)", "tests/browser/career-finder-error.browser.mts", { MOCK_CAREERS_STATUS: "400" });
const ok8 = await runCheck("Skill Gap Analyzer flow (responses delayed 1.5s)", "tests/browser/skill-gap.browser.mts", { MOCK_SKILLGAP: "ok", MOCK_DELAY_MS: "1500" });
const ok9 = await runCheck("Learning Roadmap flow (responses delayed 1.5s)", "tests/browser/roadmap.browser.mts", { MOCK_SKILLGAP: "ok", MOCK_DELAY_MS: "1500" });
const ok10 = await runCheck("Global polish: motion, reduced motion, focus, overflow", "tests/browser/polish.browser.mts", { MOCK_SKILLGAP: "ok", MOCK_DELAY_MS: "1500" });
const ok11 = await runCheck("Responsive layout and accessibility: 6 widths, pixel contrast, focus, announcements", "tests/browser/a11y-responsive.browser.mts", { MOCK_SKILLGAP: "ok", MOCK_DELAY_MS: "300" });
const ok12 = await runCheck("Final motion polish: reveal, feedback, reduced motion, print", "tests/browser/motion.browser.mts", { MOCK_SKILLGAP: "ok" });
const allOk = ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8 && ok9 && ok10 && ok11 && ok12;
console.log(`\nBROWSER CHECKS: ${allOk ? "all passed" : "FAILED"}`);
process.exit(allOk ? 0 : 1);
