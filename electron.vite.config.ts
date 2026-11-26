import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@shared": resolve("src/shared") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
          // Every bundled font except Xiaolai (12 MB CJK handwriting font; CJK text falls back to system fonts).
          ...["Assistant", "Cascadia", "ComicShanns", "Excalifont", "Liberation", "Lilita", "Nunito", "Virgil"].map((f) => ({
            src: resolve(`node_modules/@excalidraw/excalidraw/dist/prod/fonts/${f}`),
            dest: "fonts",
            rename: { stripBase: 6 },
          })),
        ],
      }),
    ],
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
