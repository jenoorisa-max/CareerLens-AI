import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import {
  handleCareers,
  handleRoadmap,
  handleSkillGap,
} from "./src/server/handlers.ts";
import { handleCvAnalyze } from "./src/server/cv/handlers.ts";
import { CV_LIMITS } from "./src/shared/cvLimits.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// `npm start` runs `node server.ts --production`. A flag (instead of
// `NODE_ENV=production node ...`) works the same on Windows, macOS and Linux
// without extra packages. It is set before express() reads NODE_ENV.
if (process.argv.includes("--production")) {
  process.env.NODE_ENV = "production";
}

// Schemas, prompts, validation and handler logic live in src/server/ and are
// shared with the Vercel functions in api/, so both entry points behave the same.

const API_POST_ROUTES = ["/api/careers", "/api/skill-gap", "/api/roadmap", "/api/cv-analyze"];

async function startServer() {
  const app = express();
  // CV analysis carries file uploads, so it has its own body limit and is
  // registered before the global 1mb parser (which therefore never runs for it).
  app.post("/api/cv-analyze", express.json({ limit: CV_LIMITS.maxRequestBytes }), async (req, res) => {
    const result = await handleCvAnalyze(req.body);
    res.status(result.status).json(result.body);
  });
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/careers", async (req, res) => {
    const result = await handleCareers(req.body);
    res.status(result.status).json(result.body);
  });

  app.post("/api/skill-gap", async (req, res) => {
    const result = await handleSkillGap(req.body);
    res.status(result.status).json(result.body);
  });

  app.post("/api/roadmap", async (req, res) => {
    const result = await handleRoadmap(req.body);
    res.status(result.status).json(result.body);
  });

  // API paths never fall through to the frontend: wrong method on a known
  // route -> 405 (same as the Vercel functions), anything else under /api -> 404.
  app.all(API_POST_ROUTES, (_req, res) => {
    res.status(405).json({ error: "Method not allowed." });
  });
  app.all(/^\/api(\/|$)/, (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Request errors (e.g. malformed JSON from express.json) always get a JSON
  // response with a safe message; internal details are never sent or logged.
  app.use(
    (
      err: { type?: string; status?: number; statusCode?: number; name?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) return next(err);
      if (err?.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON request body." });
      }
      if (err?.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body is too large." });
      }
      const status = err?.status ?? err?.statusCode;
      if (typeof status === "number" && status >= 400 && status < 500) {
        return res.status(status).json({ error: "Invalid request." });
      }
      console.error(`[server] unexpected request error (${err?.type ?? err?.name ?? "unknown"})`);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  );

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    // SPA fallback (Express 4 syntax): every GET outside /api serves the app.
    app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Application build not found.");
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`CareerLens AI server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
