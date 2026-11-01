export const BUILD_PLACEHOLDER_TOKENS = Object.freeze([
  "__STYLES__",
  "__PDFJS__",
  "__PDF_WORKER__",
  "__RENDERER__",
  "__CATALOG_CONTRACT__",
  "__RESOURCE_LIMITS__",
  "__BOUNDED_RESPONSE__",
  "__SCRIPT__",
  "__BUILD_FINGERPRINT__",
  "__PLUGIN_VERSION__",
  "__BUILD_MODE__",
  "__CATALOG_URL__",
  "__CATALOG_ENVIRONMENT__",
  "__CATALOG_SCHEMA_VERSION__",
  "__RENDERER_VERSION__",
  "__CATALOG_CACHE_KEY__",
  "__MAX_OFFLINE_AGE_HOURS__",
  "__MAX_CATALOG_ITEMS__",
  "__MAX_CATALOG_MANIFEST_BYTES__",
  "__MAX_CATALOG_ASSET_BYTES__",
  "__MAX_LOCAL_FILE_BYTES__",
  "__MAX_SELECTION_LAYERS__",
  "__MAX_SELECTION_EXPORT_BYTES__"
]);

export function findBuildPlaceholders(source) {
  return BUILD_PLACEHOLDER_TOKENS.filter((token) => source.includes(token));
}
