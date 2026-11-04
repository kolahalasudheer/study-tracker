import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DATA_FILE = join(DATA_DIR, "leaderboard.json");
const PORT = 3001;

function loadStore() {
  if (!existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveStore(store) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/leaderboard" && req.method === "GET") {
    const prefix = url.searchParams.get("prefix") || "";
    const store = loadStore();
    const keys = Object.keys(store).filter((k) => k.startsWith(prefix));
    send(res, 200, { keys });
    return;
  }

  const match = url.pathname.match(/^\/api\/leaderboard\/(.+)$/);
  if (match) {
    const key = decodeURIComponent(match[1]);
    const store = loadStore();

    if (req.method === "GET") {
      send(res, 200, store[key] != null ? { value: store[key] } : { value: null });
      return;
    }

    if (req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          store[key] = parsed.value;
          saveStore(store);
          send(res, 200, { ok: true });
        } catch {
          send(res, 400, { error: "Invalid JSON" });
        }
      });
      return;
    }

    if (req.method === "DELETE") {
      delete store[key];
      saveStore(store);
      send(res, 200, { ok: true });
      return;
    }
  }

  send(res, 404, { error: "Not found" });
}).listen(PORT, () => {
  console.log(`Leaderboard API running at http://localhost:${PORT}`);
});
