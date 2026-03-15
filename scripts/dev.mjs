import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 4173);

let buildRunning = false;
let buildQueued = false;

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

async function runBuild() {
  if (buildRunning) {
    buildQueued = true;
    return;
  }

  buildRunning = true;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build.mjs"], {
      cwd: rootDir,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build failed with exit code ${code}`));
    });
  }).catch((error) => {
    console.error(error.message);
  });
  buildRunning = false;

  if (buildQueued) {
    buildQueued = false;
    await runBuild();
  }
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);
      let pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname.endsWith("/")) pathname += "index.html";
      if (!path.extname(pathname)) pathname += "/index.html";

      const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      let target = path.join(distDir, normalized);

      if (!target.startsWith(distDir)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      if (!existsSync(target)) {
        target = path.join(distDir, "index.html");
      }

      const data = await fs.readFile(target);
      res.writeHead(200, { "Content-Type": contentType(target) });
      res.end(data);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Server error");
    }
  });

  server.listen(port, () => {
    console.log(`Dev server running at http://localhost:${port}`);
  });
}

async function getTrackedMtimeMap() {
  const map = new Map();
  const trackedFiles = [
    path.join(rootDir, "styles.css"),
    path.join(rootDir, "scripts", "build.mjs"),
  ];

  for (const file of trackedFiles) {
    if (!existsSync(file)) continue;
    const stat = await fs.stat(file);
    map.set(file, stat.mtimeMs);
  }

  if (existsSync(path.join(rootDir, "posts"))) {
    const entries = await fs.readdir(path.join(rootDir, "posts"), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const full = path.join(rootDir, "posts", entry.name);
      const stat = await fs.stat(full);
      map.set(full, stat.mtimeMs);
    }
  }

  return map;
}

function startPolling() {
  let lastSnapshot = new Map();

  const tick = async () => {
    const nextSnapshot = await getTrackedMtimeMap();
    let changed = nextSnapshot.size !== lastSnapshot.size;

    if (!changed) {
      for (const [file, mtime] of nextSnapshot) {
        if (lastSnapshot.get(file) !== mtime) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      await runBuild();
      lastSnapshot = nextSnapshot;
    }
  };

  getTrackedMtimeMap().then((initial) => {
    lastSnapshot = initial;
  });

  setInterval(() => {
    tick().catch((error) => {
      console.error(`Polling error: ${error.message}`);
    });
  }, 1000);
}

await runBuild();
startServer();
startPolling();
