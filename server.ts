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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Schemas, prompts, validation and handler logic live in src/server/ and are
// shared with the Vercel functions in api/, so both entry points behave the same.

async function startServer() {
  const app = express();
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
    app.get("/{*path}", (_req, res) => {
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
