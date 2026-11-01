import assert from "node:assert/strict";
import test from "node:test";
import { isPlausibleRemoteUrl, isReservedOrLocalHostname } from "../scripts/lib/network-policy.mjs";

test("production host policy rejects IP, local, documentation and reserved test domains", () => {
  for (const hostname of [
    "127.0.0.1",
    "[::1]",
    "localhost",
    "catalog.localhost",
    "example.com",
    "assets.example.com",
    "example.net.",
    "cdn.example.org",
    "mockup.example",
    "mockup.invalid",
    "mockup.test"
  ]) assert.equal(isReservedOrLocalHostname(hostname), true, hostname);
  assert.equal(isReservedOrLocalHostname("assets.mockup-studio-cdn.com"), false);
});

test("release origin policy accepts network git remotes and rejects local or placeholder remotes", () => {
  assert.equal(isPlausibleRemoteUrl("git@github.com:owner/repo.git"), true);
  assert.equal(isPlausibleRemoteUrl("https://github.com/owner/repo.git"), true);
  assert.equal(isPlausibleRemoteUrl("https://example.com/owner/repo.git"), false);
  assert.equal(isPlausibleRemoteUrl("/tmp/repo.git"), false);
  assert.equal(isPlausibleRemoteUrl("file:///tmp/repo.git"), false);
});
