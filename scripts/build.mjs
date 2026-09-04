import { rm, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = resolve(projectRoot, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await viteBuild({
  configFile: resolve(projectRoot, "vite.config.ts"),
});

for (const entry of ["background", "content"]) {
  await esbuild({
    absWorkingDir: projectRoot,
    entryPoints: [resolve(projectRoot, `src/${entry}/index.ts`)],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome114",
    outfile: resolve(distDir, `${entry}.js`),
    sourcemap: false,
    legalComments: "none",
  });
}

const manifestSource = resolve(projectRoot, "public/manifest.json");
if (!existsSync(manifestSource)) {
  throw new Error("public/manifest.json is missing");
}
await cp(manifestSource, resolve(distDir, "manifest.json"));

console.log("Built extension into", distDir);
