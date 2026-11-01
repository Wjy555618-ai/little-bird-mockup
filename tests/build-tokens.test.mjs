import assert from "node:assert/strict";
import test from "node:test";
import { findBuildPlaceholders } from "../scripts/lib/build-tokens.mjs";

test("build placeholder detection rejects project tokens but permits runtime PDF worker state", () => {
  assert.deepEqual(findBuildPlaceholders("const value = '__CATALOG_URL__';"), ["__CATALOG_URL__"]);
  assert.deepEqual(findBuildPlaceholders("window.__PDF_WORKER_SOURCE__ = 'bundled';"), []);
});
