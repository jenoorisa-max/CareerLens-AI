// Local Express server (server.ts) + deployment config checks.
// Starts the real server exactly like `npm start` (node server.ts --production)
// and in development mode, on ports 3131/3132, with no Gemini key (no quota used).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function killTree(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}
async function start(args: string[], port: number) {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) };
  delete env.GEMINI_API_KEY; delete env.NODE_ENV;
  const child = spawn(process.execPath, ["server.ts", ...args], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout!.on("data", (d) => (log += d)); child.stderr!.on("data", (d) => (log += d));
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) return { child, log: () => log }; } catch { /* starting */ }
    await sleep(300);
  }
  killTree(child);
  throw new Error(`server did not start on :${port}\n${log}`);
}
async function req(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, type: r.headers.get("content-type") ?? "", text, json };
}
const post = (url: string, body: string, type = "application/json") => req(url, { method: "POST", headers: { "Content-Type": type }, body });
const leaks = (s: string) => /SyntaxError|at JSON\.parse|node_modules|position \d|stack/i.test(s);

console.log("--- config");
check("npm start runs the server in production mode (`node server.ts --production`)",
  JSON.parse(read("package.json")).scripts.start === "node server.ts --production", JSON.parse(read("package.json")).scripts.start);
const vercel = JSON.parse(read("vercel.json"));
const hdrs = Object.fromEntries((vercel.headers?.[0]?.headers ?? []).map((h: any) => [h.key, h.value]));
check("vercel.json applies headers to every path", vercel.headers?.length === 1 && vercel.headers[0].source === "/(.*)", vercel.headers);
check("X-Content-Type-Options: nosniff", hdrs["X-Content-Type-Options"] === "nosniff", hdrs);
check("Referrer-Policy: strict-origin-when-cross-origin", hdrs["Referrer-Policy"] === "strict-origin-when-cross-origin", hdrs);
check("X-Frame-Options: DENY", hdrs["X-Frame-Options"] === "DENY", hdrs);
check("Permissions-Policy disables camera, microphone, geolocation, payment (all set to ())",
  ["camera", "microphone", "geolocation", "payment"].every((f) => new RegExp(`(^|, )${f}=\\(\\)`).test(hdrs["Permissions-Policy"] ?? "")), hdrs["Permissions-Policy"]);
check("exactly these 4 headers; no Content-Security-Policy in this step",
  Object.keys(hdrs).length === 4 && !Object.keys(hdrs).some((k) => /content-security-policy/i.test(k)), Object.keys(hdrs));
check("vercel.json only adds headers (no build/route/framework overrides)", Object.keys(vercel).every((k) => k === "$schema" || k === "headers"), Object.keys(vercel));
const envExample = read(".env.example");
check(".env.example documents GEMINI_API_KEY (required) and GEMINI_MODEL (optional)",
  /^GEMINI_API_KEY=/m.test(envExample) && /GEMINI_MODEL/.test(envExample) && /optional/i.test(envExample), null);
check(".env.example no longer documents the unused APP_URL; placeholder key still treated as unconfigured",
  !/APP_URL/.test(envExample) && envExample.includes('GEMINI_API_KEY="MY_GEMINI_API_KEY"') && read("src/server/gemini.ts").includes('apiKey === "MY_GEMINI_API_KEY"'), null);
check("App.tsx has no eslint-disable comment (ESLint is not used)", !/eslint-disable/.test(read("src/App.tsx")), null);

if (!existsSync(new URL("../../dist/index.html", import.meta.url))) {
  spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)), "build"], { cwd: repo, stdio: "ignore" });
}

console.log("--- production (`node server.ts --production`, as `npm start`)");
const prod = await start(["--production"], 3131);
const P = "http://localhost:3131";
try {
  const home = await req(`${P}/`);
  check("serves the BUILT app (production mode active)", home.status === 200 && home.type.includes("text/html") && home.text.includes("/assets/") && !home.text.includes("/src/main.tsx"), home.text.slice(0, 200));
  const deep = await req(`${P}/some/frontend/route`);
  check("SPA fallback: unknown frontend route -> 200 app HTML (was 404)", deep.status === 200 && deep.type.includes("text/html") && deep.text === home.text, deep.status);
  check("SPA fallback: path starting with 'api' but not '/api/' (/apix) -> app HTML", (await req(`${P}/apix`)).text === home.text, null);
  const asset = readdirSync(new URL("../../dist/assets/", import.meta.url)).find((f) => f.endsWith(".js"));
  const js = await req(`${P}/assets/${asset}`);
  check("static assets still served as files, not as the app HTML", js.status === 200 && /javascript/.test(js.type), js.type);
  check("GET /api/health unchanged", (await req(`${P}/api/health`)).json?.ok === true, null);
  const wrong = await req(`${P}/api/careers`);
  check("GET /api/careers -> JSON 405 (was HTML 404)", wrong.status === 405 && wrong.json?.error === "Method not allowed.", wrong);
  check("PUT /api/roadmap -> JSON 405", (await req(`${P}/api/roadmap`, { method: "PUT" })).status === 405, null);
  for (const p of ["/api/unknown", "/api", "/api/careers/extra"]) {
    const r = await req(`${P}${p}`);
    check(`GET ${p} -> JSON 404, never the app HTML`, r.status === 404 && r.json?.error === "Not found." && r.type.includes("application/json"), r.status);
  }
  const logBefore = prod.log().length;
  const bad = await post(`${P}/api/careers`, "{bad");
  check("malformed JSON -> JSON 400 'Invalid JSON request body.' (was HTML)", bad.status === 400 && bad.type.includes("application/json") && bad.json?.error === "Invalid JSON request body.", bad);
  check("malformed JSON response exposes no internals", !leaks(bad.text), bad.text);
  await sleep(200);
  check("malformed JSON no longer prints a stack trace to the server log", !leaks(prod.log().slice(logBefore)), prod.log().slice(logBefore));
  for (const p of ["/api/skill-gap", "/api/roadmap"]) {
    const r = await post(`${P}${p}`, "[1,");
    check(`${p}: malformed JSON -> same JSON 400`, r.status === 400 && r.json?.error === "Invalid JSON request body.", r.status);
  }
  const big = await post(`${P}/api/careers`, JSON.stringify({ name: "x".repeat(1_100_000) }));
  check("body over 1mb -> JSON 413, no internals", big.status === 413 && big.json?.error === "Request body is too large." && !leaks(big.text), big.status);
  const empty = await post(`${P}/api/careers`, "{}");
  check("valid JSON still reaches the handler (validation message unchanged)", empty.status === 400 && empty.json?.error === "Please enter your name.", empty.json);
  const gap = await post(`${P}/api/skill-gap`, JSON.stringify({ profile: {} }));
  check("skill-gap routing unchanged", gap.status === 400 && gap.json?.error === "Student profile and a selected career are required.", gap.json);
} finally { killTree(prod.child); }

console.log("--- development (`node server.ts`, Vite middleware)");
const dev = await start([], 3132);
const D = "http://localhost:3132";
try {
  const home = await req(`${D}/`);
  check("without the flag: development mode (Vite serves /src/main.tsx)", home.status === 200 && home.text.includes("/src/main.tsx"), home.text.slice(0, 200));
  check("dev: frontend route -> app HTML", (await req(`${D}/some/route`)).text.includes("/src/main.tsx"), null);
  const wrong = await req(`${D}/api/careers`);
  check("dev: GET /api/careers -> JSON 405 (previously served the app HTML)", wrong.status === 405 && wrong.json?.error === "Method not allowed.", wrong.status);
  check("dev: unknown /api path -> JSON 404", (await req(`${D}/api/nope`)).json?.error === "Not found.", null);
  const bad = await post(`${D}/api/careers`, "{bad");
  check("dev: malformed JSON -> JSON 400, no internals", bad.status === 400 && bad.json?.error === "Invalid JSON request body." && !leaks(bad.text), bad);
} finally { killTree(dev.child); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
