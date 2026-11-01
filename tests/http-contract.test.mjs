import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { fetchBoundedJsonBytes } from "../scripts/lib/http-contract.mjs";

async function serverFixture() {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/manifest.json" });
      response.end();
      return;
    }
    if (request.url === "/wrong-type") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("{}\n");
      return;
    }
    if (request.url === "/large") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(`{"value":"${"x".repeat(64)}"}`);
      return;
    }
    if (request.url === "/slow") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}\n");
      }, 100);
      return;
    }
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end("{\"catalog\":true}\n");
  });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

test("remote catalog fetch returns exact bounded JSON bytes", async () => {
  const fixture = await serverFixture();
  try {
    const bytes = await fetchBoundedJsonBytes(`${fixture.url}/manifest.json`, { maxBytes: 1024, timeoutMs: 1000 });
    assert.equal(Buffer.from(bytes).toString("utf8"), "{\"catalog\":true}\n");
  } finally {
    await fixture.close();
  }
});

test("remote catalog fetch rejects redirects, wrong media types, oversized streams and timeouts", async () => {
  const fixture = await serverFixture();
  try {
    await assert.rejects(fetchBoundedJsonBytes(`${fixture.url}/redirect`, { maxBytes: 1024, timeoutMs: 1000 }), /不得重定向/);
    await assert.rejects(fetchBoundedJsonBytes(`${fixture.url}/wrong-type`, { maxBytes: 1024, timeoutMs: 1000 }), /Content-Type无效/);
    await assert.rejects(fetchBoundedJsonBytes(`${fixture.url}/large`, { maxBytes: 16, timeoutMs: 1000 }), /超过字节上限/);
    await assert.rejects(fetchBoundedJsonBytes(`${fixture.url}/slow`, { maxBytes: 1024, timeoutMs: 10 }), /请求超时/);
  } finally {
    await fixture.close();
  }
});
