import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import builtins from "builtin-modules";

const externals = [
    "obsidian",
    "electron",
    "@codemirror/language",
    "@codemirror/state",
    "@codemirror/view",
    "@codemirror/autocomplete",
    "@codemirror/closebrackets",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/comment",
    "@codemirror/fold",
    "@codemirror/gutter",
    "@codemirror/highlight",
    "@codemirror/history",
    "@codemirror/lint",
    "@codemirror/matchbrackets",
    "@codemirror/panel",
    "@codemirror/rangeset",
    "@codemirror/search",
    "@codemirror/stream-parser",
    "@codemirror/text",
    "@codemirror/tooltip",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
];

export default defineConfig({
    plugins: [
        vue(),
        {
            name: "copy-release-assets",
            closeBundle() {
                const outDir = resolve(__dirname, "dist");
                if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
                copyFileSync(resolve(__dirname, "manifest.json"), resolve(outDir, "manifest.json"));
                const rulebookPath = resolve(__dirname, "rulebook.json");
                if (existsSync(rulebookPath)) {
                    copyFileSync(rulebookPath, resolve(outDir, "rulebook.json"));
                }
            },
        },
    ],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        target: "es2020",
        sourcemap: true,
        cssCodeSplit: false,
        lib: {
            entry: resolve(__dirname, "src/main.ts"),
            formats: ["cjs"],
        },
        rollupOptions: {
            external: externals,
            output: {
                entryFileNames: "main.js",
                assetFileNames: "styles.css",
                format: "cjs",
                exports: "auto",
            },
        },
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "@shared-ui": resolve(__dirname, "vendor/shared-ui"),
            "@tag-and-tally/shared-ui/logic": resolve(__dirname, "vendor/shared-ui/logic/index.ts"),
            "@tag-and-tally/shared-ui": resolve(__dirname, "vendor/shared-ui/index.ts"),
            "@tag-and-tally/theme": resolve(__dirname, "vendor/theme"),
            "@data": resolve(__dirname, "vendor/data"),
        },
    },
});
