import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");

async function text(path) {
  return readFile(resolve(projectRoot, path), "utf8");
}

test("public repository has explicit privacy, security, support, contribution and license boundaries", async () => {
  const [readme, privacy, security, support, contributing, license, gitignore, publicationPrep, packageJson] = await Promise.all([
    text("README.md"),
    text("PRIVACY.md"),
    text("SECURITY.md"),
    text("SUPPORT.md"),
    text("CONTRIBUTING.md"),
    text("LICENSE"),
    text(".gitignore"),
    text("docs/FIGMA_COMMUNITY_PUBLICATION_PREP.md"),
    text("package.json")
  ]);

  for (const path of ["PRIVACY.md", "SECURITY.md", "SUPPORT.md", "CONTRIBUTING.md", "LICENSE", "docs/FIGMA_COMMUNITY_PUBLICATION_PREP.md"]) {
    assert.match(readme, new RegExp(`\\(${path.replace(".", "\\.")}\\)`), `${path} must be discoverable from README`);
  }

  assert.match(privacy, /不会把用户的设计画面、导入文件或生成结果上传/);
  assert.match(privacy, /documentAccess: dynamic-page/);
  assert.match(privacy, /168 小时/);
  assert.match(security, /Report a vulnerability/);
  assert.match(security, /公开 Issue/);
  assert.match(security, /little-bird-mockup\/security\/advisories\/new/);
  assert.match(support, /不得填写占位链接/);
  assert.match(support, /little-bird-mockup\/issues/);
  assert.match(contributing, /不直接编辑 `plugin\/ui\.html`、`plugin\/code\.js` 或 `plugin\/manifest\.json`/);
  assert.match(license, /Wang Zhentao\. All rights reserved/);
  assert.match(gitignore, /^\.env$/m);
  assert.doesNotMatch(gitignore, /monster-mockup-logo|little-bird-mockup-logo/);
  assert.match(gitignore, /^docs\/evidence\/panda-brand-\*\.png$/m);
  assert.match(gitignore, /^docs\/evidence\/little-bird-wallpaper-brand-\*\.png$/m);
  assert.match(publicationPrep, /分类 \| `Design tools`/);
  assert.match(publicationPrep, /Community 应显示：`Restricted network access`/);
  assert.match(publicationPrep, /不保存用户设计数据/);
  assert.doesNotMatch(publicationPrep, /BLOCKED_BY_EXTERNAL_SETUP/);
  assert.match(publicationPrep, /私密漏洞报告已启用/);
  assert.match(publicationPrep, /PUBLICATION_AUTHORIZED/);
  assert.match(publicationPrep, /无需再次请求发布授权/);
  assert.match(packageJson, /git\+https:\/\/github\.com\/Wjy555618-ai\/little-bird-mockup\.git/);
  assert.match(packageJson, /https:\/\/github\.com\/Wjy555618-ai\/little-bird-mockup\/issues/);
});

test("active publication surfaces use only the selected right-facing bird brand and disclose its rights gate", async () => {
  const [manifest, template, ui, build, provenance] = await Promise.all([
    text("plugin/manifest.json"),
    text("plugin/manifest.template.json"),
    text("plugin/ui.template.html"),
    text("scripts/build-plugin.mjs"),
    text("docs/BRAND_ASSET_PROVENANCE.md")
  ]);

  for (const source of [manifest, template, ui, build, provenance]) {
    assert.doesNotMatch(source, /monster-mockup-logo|panda-mockup-logo|little-bird-wallpaper-logo|怪兽样机|熊猫样机|小鸟壁纸|Angry Birds|愤怒的小鸟/i);
  }
  assert.match(manifest, /"name": "小鸟样机"/);
  assert.match(build, /little-bird-mockup-logo\.png/);
  assert.match(provenance, /CONFIRMED_BY_OWNER/);
  assert.match(provenance, /决定人 Wang Zhentao 明确确认/);
});
