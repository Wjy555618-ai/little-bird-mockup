const REQUIRED_ACTIONS = new Set([
  "actions/checkout",
  "actions/setup-node",
  "pnpm/action-setup",
  "actions/upload-artifact"
]);

function fail(message) {
  throw new Error(message);
}

function exactArray(actual, expected, message) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) fail(message);
}

function jobBlocks(source) {
  const lines = source.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => line === "jobs:");
  if (jobsIndex < 0) fail("CI缺少jobs");
  const blocks = new Map();
  let current = null;
  for (const line of lines.slice(jobsIndex + 1)) {
    const job = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (job) {
      current = job[1];
      if (blocks.has(current)) fail(`CI任务重复：${current}`);
      blocks.set(current, []);
      continue;
    }
    if (current) blocks.get(current).push(line);
  }
  return new Map([...blocks].map(([id, blockLines]) => [id, blockLines.join("\n")]));
}

function actionReferences(source) {
  return [...source.matchAll(/^\s*-\s+uses:\s+([^\s#]+)/gm)].map((match) => match[1]);
}

function actionNames(references) {
  return references.map((reference) => reference.split("@", 1)[0]);
}

function runCommands(source) {
  return [...source.matchAll(/^\s*-\s+run:\s+([^\n#]+?)\s*$/gm)].map((match) => match[1].trim());
}

function validateActionPins(references) {
  for (const reference of references) {
    const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([a-f0-9]{40})$/.exec(reference);
    if (!match) fail(`第三方Action必须固定到40位提交SHA：${reference}`);
    if (!REQUIRED_ACTIONS.has(match[1])) fail(`CI包含未批准Action：${match[1]}`);
  }
}

export function validateQualityWorkflow(source) {
  if (typeof source !== "string" || !source.trim()) fail("CI工作流为空");
  if (!/^permissions:\s*\n\s+contents:\s+read\s*$/m.test(source)) fail("CI必须使用顶层contents: read最小权限");
  if ((source.match(/^permissions:\s*$/gm) || []).length !== 1 || /^\s{2,}permissions:\s*$/m.test(source)) fail("CI不得用任务级权限覆盖顶层最小权限");
  if (/^\s+[a-z-]+:\s+(?:write|admin)\s*$/m.test(source)) fail("CI不得申请write或admin权限");
  if (/continue-on-error:\s*true|^\s*if:\s*(?:false|\$\{\{\s*false\s*\}\})\s*$/mi.test(source)) fail("CI阻断任务不得静默忽略失败或被恒假条件禁用");
  if (!/^\s*pull_request:\s*$/m.test(source) || !/^\s*branches:\s*\[main\]\s*$/m.test(source) || !/^\s*tags:\s*\["v\*"\]\s*$/m.test(source)) fail("CI触发器必须覆盖PR、main和版本标签");
  if (!/^\s*schedule:\s*$/m.test(source) || !/^\s*-\s+cron:\s+"17 3 \* \* 1"\s*$/m.test(source)) fail("CI必须每周执行一次过期安全门禁刷新");

  const jobs = jobBlocks(source);
  exactArray([...jobs.keys()], ["quality", "release-engineering"], "CI必须且只能包含质量与标签发布两个阻断任务");
  const quality = jobs.get("quality");
  const release = jobs.get("release-engineering");
  if (!/^\s{4}runs-on:\s+ubuntu-latest\s*$/m.test(quality) || !/^\s{4}timeout-minutes:\s+20\s*$/m.test(quality)) fail("质量任务运行器或超时漂移");
  if (!/^\s{4}if:\s+startsWith\(github\.ref, 'refs\/tags\/v'\)\s*$/m.test(release) || !/^\s{4}needs:\s+quality\s*$/m.test(release)) fail("发布任务必须只在版本标签且质量任务通过后运行");
  if (!/^\s{4}runs-on:\s+ubuntu-latest\s*$/m.test(release) || !/^\s{4}timeout-minutes:\s+20\s*$/m.test(release)) fail("发布任务运行器或超时漂移");

  const qualityActions = actionReferences(quality);
  const releaseActions = actionReferences(release);
  validateActionPins([...qualityActions, ...releaseActions]);
  exactArray(actionNames(qualityActions), ["actions/checkout", "pnpm/action-setup", "actions/setup-node"], "质量任务Action集合或顺序漂移");
  exactArray(actionNames(releaseActions), ["actions/checkout", "pnpm/action-setup", "actions/setup-node", "actions/upload-artifact"], "发布任务Action集合或顺序漂移");
  exactArray(runCommands(quality), ["pnpm install --frozen-lockfile", "pnpm check", "pnpm security:check"], "质量任务阻断命令集合或顺序漂移");
  exactArray(runCommands(release), ["pnpm install --frozen-lockfile", "pnpm release:package"], "发布任务阻断命令集合或顺序漂移");

  for (const block of [quality, release]) {
    if (!/fetch-depth:\s*0/.test(block) || !/version:\s*10\.20\.0/.test(block) || !/node-version:\s*20/.test(block) || !/cache:\s*pnpm/.test(block)) fail("CI检出深度或固定运行时配置不完整");
  }
  if (!/name:\s*mockup-studio-\$\{\{ github\.ref_name \}\}/.test(release) || !/if-no-files-found:\s*error/.test(release) || !/path:\s*dist\/plugin/.test(release) || !/retention-days:\s*90/.test(release)) fail("CI发布制品上传策略不完整");
  return true;
}

export function validateDependabotConfig(source) {
  if (typeof source !== "string" || !source.trim()) fail("Dependabot配置为空");
  if (!/^version:\s*2\s*$/m.test(source)) fail("Dependabot配置版本必须为2");
  for (const ecosystem of ["github-actions", "npm"]) {
    const block = new RegExp(`- package-ecosystem: ${ecosystem}\\n\\s+directory: "\\/"\\n\\s+schedule:\\n\\s+interval: weekly\\n\\s+open-pull-requests-limit: 5`);
    if (!block.test(source)) fail(`Dependabot缺少${ecosystem}每周更新策略`);
  }
  return true;
}
