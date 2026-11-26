// The site: a React app built to static files. It's served at
// iainandrew.com/rabbit-hole, so it's built for that base path. The files
// themselves sit at the root of dist/: Cloudflare's assets.base_path (see
// wrangler.jsonc) maps /rabbit-hole/ onto them.

import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const DOCS = fileURLToPath(new URL("../docs", import.meta.url));

export default defineConfig({
  base: "/rabbit-hole/",
  plugins: [react(), docPages()],
  resolve: {
    // The harness's src/, for the data types the site shares with build-site.
    alias: { "@harness": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 8765,
  },
});

/**
 * A copy of index.html at each doc's address (dist/docs/<name>/index.html),
 * so a doc opened directly is a real page. The app reads the address and shows
 * the doc. The dev server does this on its own: it serves index.html for any
 * page it has no file for.
 */
function docPages(): Plugin {
  let outDir = "";
  return {
    name: "doc-pages",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const file of readdirSync(DOCS).filter((name) => name.endsWith(".md"))) {
        const page = join(outDir, "docs", file.replace(/\.md$/, ""));
        mkdirSync(page, { recursive: true });
        copyFileSync(join(outDir, "index.html"), join(page, "index.html"));
      }
    },
  };
}
