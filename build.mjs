import { build } from "esbuild";

// Native modules that must be resolved at runtime via require()
// Native modules and their transitive deps that must be resolved at runtime
const nativeExternals = ["better-sqlite3", "sqlite-vec", "onnxruntime-node", "@huggingface/transformers"];

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  sourcemap: true,
  external: nativeExternals,
  banner: {
    js: [
      `import { createRequire } from "node:module";`,
      `const require = createRequire(import.meta.url);`,
    ].join("\n"),
  },
};

await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/miniclaw.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/vault-cli.ts"],
  outfile: "dist/vault-cli.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/persona-cli.ts"],
  outfile: "dist/persona-cli.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/snapshot-cli.ts"],
  outfile: "dist/snapshot-cli.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/install-tui.ts"],
  outfile: "dist/install-tui.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/kb-cli.ts"],
  outfile: "dist/kb-cli.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/kanban-cli.ts"],
  outfile: "dist/kanban-cli.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/service-cli.ts"],
  outfile: "dist/service-cli.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/dispatch-cli.ts"],
  outfile: "dist/dispatch-cli.mjs",
});

console.log("Build complete → dist/miniclaw.mjs, dist/vault-cli.mjs, dist/persona-cli.mjs, dist/snapshot-cli.mjs, dist/install-tui.mjs, dist/kb-cli.mjs, dist/kanban-cli.mjs, dist/service-cli.mjs, dist/dispatch-cli.mjs");
