// The site: a React app built to static files. It's served at
// iainandrew.com/rabbit-hole, so it's built for that base path, into a
// folder of the same name, mirroring the URLs the host will serve.

import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/rabbit-hole/",
  plugins: [react()],
  resolve: {
    // The harness's src/, for the data types the site shares with build-site.
    alias: { "@harness": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  build: {
    outDir: "dist/rabbit-hole",
    emptyOutDir: true,
  },
  server: {
    port: 8765,
  },
});
