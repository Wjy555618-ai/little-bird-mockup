import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [policySource, codeTemplate, uiSource, uiTemplate, buildSource] = await Promise.all([
  readFile(resolve(projectRoot, "shared/user-error-policy.js"), "utf8"),
  readFile(resolve(projectRoot, "plugin/code.template.js"), "utf8"),
  readFile(resolve(projectRoot, "plugin/ui.js"), "utf8"),
  readFile(resolve(projectRoot, "plugin/ui.template.html"), "utf8"),
  readFile(resolve(projectRoot, "scripts/build-plugin.mjs"), "utf8")
]);

const policyHost = { console: { warn() {} } };
runInNewContext(policySource, policyHost);
const policy = policyHost.MockupUserErrors;

test("one error policy owns every user-visible fallback", () => {
  assert.ok(policy);
  assert.equal(policy.message(new Error("Failed to fetch"), policy.CODES.CATALOG_UNAVAILABLE), "素材库暂时无法连接，请检查网络后重试");
  assert.equal(policy.message(new Error("TypeError: internal stack"), policy.CODES.PASTE_FAILED), "暂时无法粘贴到画布，请重试");
  const intentional = policy.create(policy.CODES.SELECTION_TOO_LARGE, "一次最多读取 50 个图层");
  assert.equal(policy.message(intentional, policy.CODES.SELECTION_READ_FAILED), "一次最多读取 50 个图层");
});

test("cross-context error messages are accepted only when marked safe by the shared policy", () => {
  const unsafe = { type: "selection-error", errorCode: policy.CODES.SELECTION_READ_FAILED, message: "Failed to fetch" };
  assert.equal(policy.messageFromPayload(unsafe, policy.CODES.SELECTION_READ_FAILED), "无法读取当前选区，请重新选择后再试");
  const safe = policy.payload("selection-error", policy.create(policy.CODES.SELECTION_REQUIRED), policy.CODES.SELECTION_REQUIRED);
  assert.equal(policy.messageFromPayload(safe, policy.CODES.SELECTION_READ_FAILED), "请先选择一个可以读取的 Figma 图层");
});

test("plugin surfaces never pass raw caught errors directly to users", () => {
  assert.doesNotMatch(codeTemplate, /message:\s*error instanceof Error\s*\?\s*error\.message/);
  assert.doesNotMatch(uiSource, /showToast\([^\n]*error\.message/);
  assert.doesNotMatch(uiSource, /showToast\(message\.message\)/);
  assert.match(codeTemplate, /userErrors\.payload\("selection-error"/);
  assert.match(codeTemplate, /userErrors\.payload\("paste-error"/);
  assert.match(uiSource, /userErrors\.messageFromPayload/);
});

test("the shared error policy is embedded in both plugin execution contexts and the build fingerprint", () => {
  assert.match(uiTemplate, /\/\*__USER_ERROR_POLICY__\*\//);
  assert.match(buildSource, /shared\/user-error-policy\.js/);
  assert.match(buildSource, /`\$\{userErrorPolicy\}\\n\$\{pluginCodeTemplate\}`/);
  assert.match(buildSource, /\.replace\("\/\*__USER_ERROR_POLICY__\*\/"/);
});
