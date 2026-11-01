(function attachMockupCatalogContract(global) {
  "use strict";

  function numericVersion(version, label) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || "");
    if (!match) throw new Error(`${label} 必须是数字语义版本`);
    return match.slice(1).map(Number);
  }

  function compareVersions(left, right) {
    const a = numericVersion(left, "版本");
    const b = numericVersion(right, "版本");
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
  }

  function validateRelativeAssetPath(value, label) {
    if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || value.includes("?") || value.includes("#") || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.split("/").includes("..")) {
      throw new Error(`${label}必须是目录内相对路径`);
    }
  }

  function validateManifest(manifest, expected, validateAsset) {
    if (!manifest || manifest.schemaVersion !== expected.schemaVersion) throw new Error("素材清单版本与插件不兼容");
    if (manifest.environment !== expected.environment) throw new Error("素材清单环境与当前构建不匹配");
    if (manifest.rendererVersion !== expected.rendererVersion) throw new Error("素材渲染器版本与插件不兼容");
    if (!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(manifest.catalogVersion || "")) throw new Error("素材目录版本无效");
    const publishedAt = Date.parse(manifest.publishedAt);
    const currentTime = Number.isFinite(expected.currentTime) ? expected.currentTime : Date.now();
    if (!Number.isFinite(publishedAt) || publishedAt > currentTime + 300_000) throw new Error("素材目录发布时间无效");
    if (compareVersions(manifest.minimumPluginVersion, expected.pluginVersion) > 0) throw new Error("素材目录需要更新版本的插件");
    if (!Array.isArray(manifest.categories) || !Array.isArray(manifest.items)) throw new Error("素材清单缺少 categories 或 items");
    if (!Number.isInteger(expected.maxItems) || expected.maxItems < 1 || manifest.items.length > expected.maxItems) throw new Error("素材数量超过当前插件上限");

    const categoryIds = new Set();
    for (const category of manifest.categories) {
      if (!category?.id || !category.label || categoryIds.has(category.id)) throw new Error("素材分类无效或重复");
      categoryIds.add(category.id);
    }

    const itemIds = new Set();
    const requiredStatus = expected.environment === "production" ? "approved" : "testing";
    for (const item of manifest.items) {
      if (!item?.id || itemIds.has(item.id)) throw new Error("样机 ID 无效或重复");
      itemIds.add(item.id);
      if (!Number.isInteger(item.revision) || item.revision < 1) throw new Error(`样机 revision 无效：${item.id}`);
      if (!categoryIds.has(item.category)) throw new Error(`样机分类不存在：${item.id}`);
      if (item.status !== requiredStatus) throw new Error(`样机状态不属于 ${expected.environment}：${item.id}`);
      if (item.provenance?.kind !== "generated-in-house") throw new Error(`样机缺少可信来源：${item.id}`);
      if (!/^[a-f0-9]{64}$/.test(item.integrity?.baseSha256 || "") || !/^[a-f0-9]{64}$/.test(item.integrity?.thumbnailSha256 || "")) {
        throw new Error(`样机缺少完整性摘要：${item.id}`);
      }
      validateRelativeAssetPath(item.layers?.base, `样机基础图层路径：${item.id}`);
      validateRelativeAssetPath(item.thumbnail, `样机缩略图路径：${item.id}`);
      for (const [layerName, layerPath] of Object.entries(item.layers || {})) {
        validateRelativeAssetPath(layerPath, `样机图层路径：${item.id}/${layerName}`);
        if (!layerPath || !/^[a-f0-9]{64}$/.test(item.integrity?.[`${layerName}Sha256`] || "")) {
          throw new Error(`样机图层缺少完整性摘要：${item.id}/${layerName}`);
        }
      }
      if (expected.environment === "production") {
        if (!item.qa?.approvedAt || item.qa.rendererVersion !== expected.rendererVersion || !/^[a-f0-9]{64}$/.test(item.qa.sourceItemSha256 || "") || !item.qa.report) {
          throw new Error(`正式样机缺少有效质检记录：${item.id}`);
        }
        if (item.provenance?.pipelinePolicyId) {
          if (!/^[a-f0-9]{64}$/.test(item.qa.reportSha256 || "")) throw new Error(`正式样机缺少技术 QA 文件摘要：${item.id}`);
          if (!item.release?.decidedAt || item.release.actor?.type !== "human" || !item.release.actor.identity || item.release.sourceItemSha256 !== item.qa.sourceItemSha256 || item.release.qaReportSha256 !== item.qa.reportSha256 || !/^[a-f0-9]{64}$/.test(item.release.reportSha256 || "")) {
            throw new Error(`正式样机缺少绑定的人类入库批准：${item.id}`);
          }
          validateRelativeAssetPath(item.release.report, `正式样机入库批准路径：${item.id}`);
        }
      }
      validateAsset(item);
    }
    return manifest;
  }

  global.MockupCatalogContract = Object.freeze({ compareVersions, validateManifest });
})(window);
