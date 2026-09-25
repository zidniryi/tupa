import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distCli = join(here, "..", "..", "dist", "cli.js");

// esbuild/tsup has been seen silently rewriting import("node:sqlite") to the
// non-existent bare specifier import("sqlite") — the dynamic import then fails at
// runtime and the adapter just looks "not detected", with no build error. Guard
// against that regressing silently. Only runs when dist/cli.js has already been
// built (`npm run build`); skipped otherwise so a bare `npm test` still passes.
test("built dist/cli.js does not mangle the node:sqlite import", { skip: !existsSync(distCli) }, () => {
  const source = readFileSync(distCli, "utf8");
  assert.ok(!source.includes('import("sqlite")'), 'found mangled import("sqlite") — node:sqlite was not preserved by the build');
});
