import type { RuntimeAdapter } from "./types";

const isBun = typeof globalThis.Bun !== "undefined";

let runtime: RuntimeAdapter;

if (isBun) {
  // Dynamic path string prevents esbuild from bundling the bun adapter
  const bunPath = "./bun" + "";
  runtime = (await import(/* @vite-ignore */ bunPath)).default;
} else {
  runtime = (await import("./node")).default;
}

export { runtime };
export type { RuntimeAdapter, SqliteDatabase } from "./types";
