import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["zod"] })],
    resolve: { alias: { "@shared": resolve("src/shared") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["zod"] })],
    resolve: { alias: { "@shared": resolve("src/shared") } },
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: {
    root: "src/renderer",
    resolve: { alias: { "@shared": resolve("src/shared") } },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          { src: resolve("node_modules/@excalidraw/excalidraw/dist/prod/fonts"), dest: ".", rename: { stripBase: 5 } },
        ],
      }),
    ],
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
