// tsc rewrites ".ts" import paths to ".js" in emitted JavaScript but not in .d.ts files.
// Published declarations must point at ".js" so every TypeScript version and bundler resolves them.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../dist/", import.meta.url).pathname;
let changed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".d.ts"))) {
  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  const after = before.replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2");
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
  }
}
const leftover = readdirSync(dir).filter((f) => f.endsWith(".d.ts")).some((f) => /from\s+["']\.{1,2}\/[^"']+\.ts["']/.test(readFileSync(join(dir, f), "utf8")));
if (leftover) {
  console.error("fix-dts-extensions: a relative .ts import is still present in dist/*.d.ts");
  process.exit(1);
}
console.log(`fix-dts-extensions: rewrote ${changed} declaration file(s)`);
