import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = await readFile(resolve(projectRoot, "shared/bounded-response.js"), "utf8");
const host = {};
runInNewContext(source, { window: host, Uint8Array, Number, TypeError, RangeError, Error, Object });
const { readBoundedResponse } = host.MockupBoundedResponse;

function streamingResponse(chunks, contentLength = null) {
  let index = 0;
  let cancelled = false;
  return {
    headers: { get: (name) => name === "content-length" ? contentLength : null },
    body: {
      getReader: () => ({
        read: async () => index < chunks.length ? { value: chunks[index++], done: false } : { done: true },
        cancel: async () => { cancelled = true; }
      })
    },
    wasCancelled: () => cancelled
  };
}

test("bounded responses reject an oversized declared Content-Length before reading", async () => {
  const response = streamingResponse([new Uint8Array([1])], "33");
  await assert.rejects(readBoundedResponse(response, 32, "素材"), /超过 32 字节上限/);
  assert.equal(response.wasCancelled(), false, "the body was never opened");
});

test("bounded responses stop chunked transfers immediately after crossing the limit", async () => {
  const response = streamingResponse([new Uint8Array(20), new Uint8Array(13)]);
  await assert.rejects(readBoundedResponse(response, 32, "素材"), /超过 32 字节上限/);
  assert.equal(response.wasCancelled(), true);
});

test("bounded responses preserve exact bytes at the configured limit", async () => {
  const response = streamingResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4])], "4");
  const bytes = await readBoundedResponse(response, 4, "素材");
  assert.deepEqual([...bytes], [1, 2, 3, 4]);
});

test("invalid byte limits and Content-Length values fail closed", async () => {
  await assert.rejects(readBoundedResponse(streamingResponse([]), 0), /正整数/);
  await assert.rejects(readBoundedResponse(streamingResponse([], "4.5"), 8, "素材"), /Content-Length 无效/);
});
