export async function fetchBoundedJsonBytes(url, options = {}) {
  const maxBytes = options.maxBytes;
  const timeoutMs = options.timeoutMs;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("远程JSON字节上限必须是正整数");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("远程JSON超时必须是正整数");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("远程JSON请求超时")), timeoutMs);
  try {
    const response = await (options.fetchImpl || fetch)(url, { signal: controller.signal, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) throw new Error("远程JSON不得重定向");
    if (!response.ok) throw new Error(`远程JSON返回HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") throw new Error(`远程JSON Content-Type无效：${contentType || "missing"}`);
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error("远程JSON超过字节上限");

    if (!response.body?.getReader) throw new Error("远程JSON响应不可流式读取");
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("远程JSON超过字节上限");
      }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("远程JSON请求超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
