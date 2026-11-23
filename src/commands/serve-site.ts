// Serve the site from site/ on localhost, to look at it before it's deployed.
// Static files only, like the real host. Free: reads files.
// Usage: npm run serve-site  (run npm run build-site first)

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const ROOT = resolve("site");
const PORT = Number(process.env.PORT ?? 8765);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
};

if (!existsSync(join(ROOT, "data", "leaderboards.json"))) {
  console.error("site/data/ is missing: run npm run build-site first.");
  process.exit(1);
}

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const file = resolve(ROOT, `.${path.endsWith("/") ? `${path}index.html` : path}`);
  // Anything outside site/ (a path with "..") is refused, not served.
  if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }
  // No caching, so a rebuilt page shows on the next reload.
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(response);
}).listen(PORT, () => {
  console.log(`Serving site/ at http://localhost:${PORT}`);
});
