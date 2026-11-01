(function attachMockupBoundedResponse(global) {
  "use strict";

  function validateLimit(maxBytes) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError("响应字节上限必须是正整数");
  }

  function declaredLength(response, label) {
    const raw = response?.headers?.get?.("content-length");
    if (raw === null || raw === undefined || raw === "") return null;
    if (!/^\d+$/.test(raw)) throw new Error(`${label} Content-Length 无效`);
    return Number(raw);
  }

  async function readBoundedResponse(response, maxBytes, label = "响应") {
    validateLimit(maxBytes);
    if (!response) throw new TypeError(`${label} 响应不存在`);
    const length = declaredLength(response, label);
    if (length !== null && length > maxBytes) throw new Error(`${label}超过 ${maxBytes} 字节上限`);

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          await reader.cancel?.().catch?.(() => {});
          throw new Error(`${label}超过 ${maxBytes} 字节上限`);
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
    }

    if (typeof response.arrayBuffer !== "function") throw new TypeError(`${label}响应不可读取`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(`${label}超过 ${maxBytes} 字节上限`);
    return bytes;
  }

  global.MockupBoundedResponse = Object.freeze({ readBoundedResponse });
})(window);
