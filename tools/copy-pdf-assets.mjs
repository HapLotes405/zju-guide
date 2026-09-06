import { createRequire } from "node:module";
import { readFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("pdfjs-dist/package.json");
const source = path.dirname(packagePath);
const { version } = JSON.parse(await readFile(packagePath, "utf8"));
const destination = path.resolve("public", "pdfjs", version);
await mkdir(destination, { recursive: true });
await cp(
  path.join(source, "build", "pdf.worker.min.mjs"),
  path.join(destination, "pdf.worker.min.mjs"),
);
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(path.join(source, folder), path.join(destination, folder), { recursive: true });
}
console.log(`PDF reader assets ready (${version}).`);
