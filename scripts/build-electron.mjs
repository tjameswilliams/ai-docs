import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "electron/dist/main.mjs",
  sourcemap: true,
  external: [
    "electron",
    "better-sqlite3",
    "jsdom",
    "@mozilla/readability",
    "bun:sqlite",
    "drizzle-orm/bun-sqlite",
    "drizzle-orm/bun-sqlite/migrator",
    "@resvg/resvg-js",
    "@resvg/resvg-js-darwin-arm64",
    "@resvg/resvg-js-darwin-x64",
    "@resvg/resvg-js-win32-x64-msvc",
    "@resvg/resvg-js-linux-x64-gnu",
  ],
  banner: {
    js: `
import { fileURLToPath as __fileURLToPath } from "url";
import { dirname as __pathDirname } from "path";
import { createRequire as __createRequire } from "module";
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __pathDirname(__filename);
const require = __createRequire(import.meta.url);
    `.trim(),
  },
});

await esbuild.build({
  entryPoints: ["electron/preload.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "electron/dist/preload.cjs",
  sourcemap: true,
  external: ["electron"],
});

console.log("Electron build complete.");
