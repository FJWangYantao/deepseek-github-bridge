import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = resolve(process.cwd());
const sourceRoot = resolve(projectRoot, "src");

export default defineConfig({
  plugins: [react()],
  root: sourceRoot,
  publicDir: false,
  base: "./",
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(sourceRoot, "panel/index.html"),
    },
  },
});
