import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const renderedVideosDir = path.resolve(__dirname, "../rendered_videos");

function localRenderedVideosPlugin() {
  return {
    name: "local-rendered-videos",
    configureServer(server) {
      server.middlewares.use("/rendered_videos", (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const requestPath = req.url.split("?")[0].split("#")[0];
        const decoded = decodeURIComponent(requestPath || "");
        const relative = decoded.replace(/^\/+/, "");
        const absolute = path.resolve(renderedVideosDir, relative);
        const safeRoot = `${renderedVideosDir}${path.sep}`;

        if (
          absolute !== renderedVideosDir &&
          !absolute.startsWith(safeRoot)
        ) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        if (!fs.existsSync(absolute)) {
          next();
          return;
        }

        if (!absolute.toLowerCase().endsWith(".mp4")) {
          res.statusCode = 415;
          res.end("Unsupported media type");
          return;
        }

        res.setHeader("Content-Type", "video/mp4");
        if (req.method === "HEAD") {
          res.statusCode = 200;
          res.end();
          return;
        }
        fs.createReadStream(absolute).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localRenderedVideosPlugin()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8005",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

