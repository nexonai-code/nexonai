const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    outfile: "public/bundle.js",
    format: "iife",
    target: "es2020",
    minify: false,
  })
  .then(() => console.log("Built public/bundle.js"))
  .catch(() => process.exit(1));
