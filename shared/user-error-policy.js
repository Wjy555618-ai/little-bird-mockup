(function attachMockupUserErrors(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MockupUserErrors = api;
})(typeof window !== "undefined" ? window : globalThis, function createMockupUserErrors() {
  const CODES = Object.freeze({
    SELECTION_REQUIRED: "SELECTION_REQUIRED",
    SELECTION_TOO_LARGE: "SELECTION_TOO_LARGE",
    SELECTION_READ_FAILED: "SELECTION_READ_FAILED",
    PASTE_FAILED: "PASTE_FAILED",
    CATALOG_UNAVAILABLE: "CATALOG_UNAVAILABLE",
    ASSET_LOAD_FAILED: "ASSET_LOAD_FAILED",
    FILE_READ_FAILED: "FILE_READ_FAILED",
    EXPORT_FAILED: "EXPORT_FAILED",
    REQUEST_TIMEOUT: "REQUEST_TIMEOUT"
  });

  const MESSAGES = Object.freeze({
    [CODES.SELECTION_REQUIRED]: "请先选择一个可以读取的 Figma 图层",
    [CODES.SELECTION_TOO_LARGE]: "当前选区过大，请减少图层后重试",
    [CODES.SELECTION_READ_FAILED]: "无法读取当前选区，请重新选择后再试",
    [CODES.PASTE_FAILED]: "暂时无法粘贴到画布，请重试",
    [CODES.CATALOG_UNAVAILABLE]: "素材库暂时无法连接，请检查网络后重试",
    [CODES.ASSET_LOAD_FAILED]: "样机素材暂时无法加载，请稍后重试",
    [CODES.FILE_READ_FAILED]: "无法读取这个文件，请更换文件后重试",
    [CODES.EXPORT_FAILED]: "暂时无法导出样机，请重试",
    [CODES.REQUEST_TIMEOUT]: "连接超时，请检查网络后重试"
  });

  const knownCodes = new Set(Object.values(CODES));

  function normalizedCode(code, fallbackCode) {
    if (knownCodes.has(code)) return code;
    if (knownCodes.has(fallbackCode)) return fallbackCode;
    return CODES.EXPORT_FAILED;
  }

  function create(code, userMessage) {
    const resolvedCode = normalizedCode(code);
    const error = new Error(typeof userMessage === "string" && userMessage.trim() ? userMessage : MESSAGES[resolvedCode]);
    error.name = "MockupUserError";
    error.errorCode = resolvedCode;
    error.userSafe = true;
    return error;
  }

  function message(error, fallbackCode) {
    const resolvedCode = normalizedCode(error?.errorCode, fallbackCode);
    if (error?.userSafe === true && typeof error.message === "string" && error.message.trim()) return error.message;
    return MESSAGES[resolvedCode];
  }

  function payload(type, error, fallbackCode) {
    const errorCode = normalizedCode(error?.errorCode, fallbackCode);
    return {
      type,
      errorCode,
      message: message(error, errorCode),
      userSafe: true
    };
  }

  function messageFromPayload(value, fallbackCode) {
    if (!value || value.userSafe !== true || !knownCodes.has(value.errorCode)) return MESSAGES[normalizedCode(fallbackCode)];
    return typeof value.message === "string" && value.message.trim() ? value.message : MESSAGES[value.errorCode];
  }

  function report(context, error, fallbackCode, logger = console.warn) {
    const errorCode = normalizedCode(error?.errorCode, fallbackCode);
    if (typeof logger === "function") logger(`[小鸟样机:${context}] ${errorCode}`, error);
    return MESSAGES[errorCode];
  }

  return Object.freeze({ CODES, MESSAGES, create, message, payload, messageFromPayload, report });
});
