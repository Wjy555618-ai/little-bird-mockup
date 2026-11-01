import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [builtCode, template, userErrorPolicy] = await Promise.all([
  readFile(resolve(projectRoot, "plugin/code.js"), "utf8"),
  readFile(resolve(projectRoot, "plugin/code.template.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/user-error-policy.js"), "utf8")
]);

function node(id, exportAsync) {
  return {
    id,
    name: id,
    type: "RECTANGLE",
    absoluteRenderBounds: { x: Number(id.split("-").at(-1)) * 10 || 0, y: 0, width: 10, height: 10 },
    exportAsync
  };
}

function runtime(source, selection, environment = {}) {
  const messages = [];
  const resizes = [];
  const figma = {
    showUI() {},
    currentPage: { selection },
    ui: { postMessage: (message) => messages.push(message), resize: (width, height) => resizes.push([width, height]), onmessage: null },
    clientStorage: { getAsync: async () => null, setAsync: async () => {} },
    on() {},
    viewport: { center: { x: 0, y: 0 } }
  };
  const assembledSource = source.includes("attachMockupUserErrors") ? source : `${userErrorPolicy}\n${source}`;
  runInNewContext(assembledSource, {
    figma,
    __html__: "",
    Uint8Array,
    Error,
    Set,
    Math,
    Number,
    Promise,
    Date: environment.Date || Date,
    setTimeout: environment.setTimeout || setTimeout
  });
  return { figma, messages, resizes };
}

function timerHarness() {
  let now = 0;
  let timerId = 0;
  const queue = [];
  class FakeDate extends Date {
    static now() { return now; }
  }
  function runNext(count = 1) {
    for (let index = 0; index < count && queue.length; index += 1) {
      queue.sort((left, right) => left.at - right.at || left.id - right.id);
      const next = queue.shift();
      now = next.at;
      next.callback();
    }
  }
  return {
    Date: FakeDate,
    setTimeout(callback, delay = 0) {
      timerId += 1;
      queue.push({ id: timerId, at: now + Number(delay), callback });
      return timerId;
    },
    runNext,
    runAll() {
      let safety = 0;
      while (queue.length) {
        runNext();
        safety += 1;
        if (safety > 1000) throw new Error("timer harness exceeded safety limit");
      }
    }
  };
}

test("Figma window resize animates monotonically and can reverse without a stale completion", async () => {
  const timers = timerHarness();
  const { figma, messages, resizes } = runtime(builtCode, [], timers);

  await figma.ui.onmessage({ type: "set-window-state", state: "collapsed" });
  timers.runNext(8);
  const intermediate = resizes.at(-1);
  assert.ok(intermediate[0] < 820 && intermediate[0] > 320);
  assert.ok(intermediate[1] < 600 && intermediate[1] > 64);
  const collapseProgress = messages.filter((message) => message.type === "window-state-progress").at(-1);
  assert.equal(collapseProgress.state, "collapsed");
  assert.ok(collapseProgress.progress > 0 && collapseProgress.progress < 1);

  await figma.ui.onmessage({ type: "set-window-state", state: "expanded" });
  timers.runAll();

  assert.deepEqual(resizes.at(-1), [820, 600]);
  assert.ok(resizes.length > 20);
  const progressMessages = messages.filter((message) => message.type === "window-state-progress");
  assert.ok(progressMessages.length > 20);
  assert.equal(progressMessages.at(-1).state, "expanded");
  assert.equal(progressMessages.at(-1).progress, 0);
  assert.deepEqual(
    messages.filter((message) => message.type === "window-state-applied").map((message) => message.state),
    ["expanded"]
  );
});

test("Figma selection export rejects more than fifty layers before exporting bytes", async () => {
  let calls = 0;
  const selection = Array.from({ length: 51 }, (_, index) => node(`node-${index}`, async () => {
    calls += 1;
    return new Uint8Array([1]);
  }));
  const { figma, messages } = runtime(builtCode, selection);
  await figma.ui.onmessage({ type: "request-selection" });
  assert.equal(calls, 0);
  assert.match(messages.at(-1).message, /最多读取 50 个图层/);
});

test("Figma selection layers export sequentially with a maximum concurrency of one", async () => {
  let active = 0;
  let maxActive = 0;
  const selection = Array.from({ length: 5 }, (_, index) => node(`node-${index}`, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2));
    active -= 1;
    return new Uint8Array([index]);
  }));
  const { figma, messages } = runtime(builtCode, selection);
  await figma.ui.onmessage({ type: "request-selection" });
  const composite = messages.find((message) => message.type === "selection-composite");
  assert.equal(maxActive, 1);
  assert.equal(composite.layers.length, 5);
});

test("Figma selection export rejects cumulative bytes above the configured ceiling", async () => {
  const smallLimitCode = template
    .replace('"__PLUGIN_VERSION__"', '"0.1.0"')
    .replace('"__CATALOG_CACHE_KEY__"', '"test-cache"')
    .replace("__MAX_SELECTION_LAYERS__", "50")
    .replace("__MAX_SELECTION_EXPORT_BYTES__", "10");
  const selection = [
    node("node-0", async () => new Uint8Array(6)),
    node("node-1", async () => new Uint8Array(5))
  ];
  const { figma, messages } = runtime(smallLimitCode, selection);
  await figma.ui.onmessage({ type: "request-selection" });
  assert.equal(messages.some((message) => message.type === "selection-composite"), false);
  assert.match(messages.at(-1).message, /超过 \d+ MB/);
});
