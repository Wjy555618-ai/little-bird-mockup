import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateDependabotConfig, validateQualityWorkflow } from "../scripts/lib/ci-contract.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workflow = await readFile(resolve(projectRoot, ".github/workflows/quality.yml"), "utf8");
const dependabot = await readFile(resolve(projectRoot, ".github/dependabot.yml"), "utf8");

test("quality workflow satisfies the immutable least-privilege CI contract", () => {
  assert.equal(validateQualityWorkflow(workflow), true);
});

test("quality workflow rejects movable actions, expanded permissions and missing blocking commands", () => {
  assert.throws(() => validateQualityWorkflow(workflow.replace(/actions\/checkout@[a-f0-9]{40}/, "actions/checkout@v4")), /40位提交SHA/);
  assert.throws(() => validateQualityWorkflow(workflow.replace("contents: read", "contents: write")), /contents: read|write或admin/);
  assert.throws(() => validateQualityWorkflow(workflow.replace("      - run: pnpm security:check\n", "")), /质量任务阻断命令/);
  assert.throws(() => validateQualityWorkflow(workflow.replace("pnpm release:package", "pnpm release:check")), /发布任务阻断命令/);
  assert.throws(() => validateQualityWorkflow(`${workflow}\n  inert-job:\n    runs-on: ubuntu-latest\n    steps: []\n`), /只能包含质量与标签发布/);
  assert.throws(() => validateQualityWorkflow(workflow.replace("    needs: quality", "    needs: quality\n    if: false")), /恒假条件|版本标签/);
  assert.throws(() => validateQualityWorkflow(workflow.replace("      - run: pnpm check", "      - run: pnpm check\n        continue-on-error: true")), /静默忽略失败/);
  assert.throws(() => validateQualityWorkflow(workflow.replace("      - run: pnpm check", "      - uses: vendor/unknown@" + "a".repeat(40) + "\n      - run: pnpm check")), /未批准Action/);
});

test("CI requires a weekly security refresh and weekly action and npm dependency updates", () => {
  assert.equal(validateDependabotConfig(dependabot), true);
  assert.throws(() => validateQualityWorkflow(workflow.replace('    - cron: "17 3 * * 1"\n', "")), /每周/);
  assert.throws(() => validateDependabotConfig(dependabot.replace("package-ecosystem: github-actions", "package-ecosystem: docker")), /github-actions/);
  assert.throws(() => validateDependabotConfig(dependabot.replace("interval: weekly", "interval: monthly")), /每周/);
});
