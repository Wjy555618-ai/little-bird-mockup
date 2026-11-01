import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { analyzeCompleteBase, assertCompleteBaseMetrics, assertNoChromaSchema } from "../scripts/lib/no-chroma.mjs";

function item() {
  return {
    id: "gate-fixture",
    revision: 2,
    name: "Gate fixture",
    renderer: "static-screen-v5",
    canvas: { width: 120, height: 80 },
    screen: {
      quad: [[0, 0], [120, 0], [120, 80], [0, 80]],
      aperture: { quad: [[0, 0], [120, 0], [120, 80], [0, 80]], cornerRadii: [0, 0, 0, 0] },
      compositing: { mode: "aperture-mask" },
      presentation: { mode: "neutral-off" },
      recommendedSize: { width: 120, height: 80, label: "3:2" }
    },
    provenance: { kind: "generated-in-house" },
    layers: { base: "assets/gate-fixture-r2.png" },
    integrity: { baseSha256: "a".repeat(64) }
  };
}

test("neutral-off 只接受中性关屏，不接受蓝色生成界面或绿色色键板", async () => {
  const neutral = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#111318" } }).png().toBuffer();
  const blue = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#25345f" } }).png().toBuffer();
  const green = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#00ff00" } }).png().toBuffer();
  assert.equal((await analyzeCompleteBase(neutral, item())).pass, true);
  const blueMetrics = await analyzeCompleteBase(blue, item());
  assert.equal(blueMetrics.pass, false);
  assert.equal((await analyzeCompleteBase(green, item())).pass, false);
  assert.throws(() => assertCompleteBaseMetrics(item(), blueMetrics), /未绑定参考图/);
});

test("reference-bound 彩色画面必须绑定与 provenance 相同的准确参考摘要", async () => {
  const candidate = item();
  const referenceSha256 = "c".repeat(64);
  candidate.screen.presentation = { mode: "reference-bound", referenceSha256 };
  candidate.provenance.referenceSha256 = referenceSha256;
  const blue = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#25345f" } }).png().toBuffer();
  assert.equal((await analyzeCompleteBase(blue, candidate)).pass, true);
  candidate.screen.presentation.referenceSha256 = "d".repeat(64);
  assert.throws(() => assertNoChromaSchema(candidate), /准确参考图摘要/);
});

test("高绿色完整画面不阻塞技术 QA，只在最终批次绑定准确 SHA 消歧", async () => {
  const candidate = item();
  const referenceSha256 = "c".repeat(64);
  candidate.screen.presentation = { mode: "reference-bound", referenceSha256 };
  candidate.provenance.referenceSha256 = referenceSha256;
  const green = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#00ff00" } }).png().toBuffer();
  const metrics = await analyzeCompleteBase(green, candidate);
  assert.equal(metrics.pass, false);
  assert.throws(() => assertCompleteBaseMetrics(candidate, metrics), /最终批次决定.*准确底图摘要/);
  assert.deepEqual(assertCompleteBaseMetrics(candidate, metrics, null, { allowPendingFinalDecision: true }), {
    ...metrics,
    technicalPass: true,
    resolution: "final-batch-decision-required"
  });
  assert.throws(() => assertCompleteBaseMetrics(candidate, metrics, {
    completeBaseConfirmed: true,
    candidateSha256: "b".repeat(64)
  }), /最终批次决定.*准确底图摘要/);
  assert.deepEqual(assertCompleteBaseMetrics(candidate, metrics, {
    completeBaseConfirmed: true,
    candidateSha256: candidate.integrity.baseSha256
  }), {
    ...metrics,
    pass: true,
    technicalPass: true,
    resolution: "final-batch-human-confirmation"
  });
});

test("旧色键字段不能进入 v5", () => {
  const legacy = item();
  legacy.chromaKey = { enabled: true };
  assert.throws(() => assertNoChromaSchema(legacy), /chromaKey/);
  const underlap = item();
  underlap.screen.underlap = 16;
  assert.throws(() => assertNoChromaSchema(underlap), /色键衬底/);
});

test("全新非迁移资产允许从 r1 开始，revision 不能被当作绿幕证据", async () => {
  const firstRevision = item();
  firstRevision.revision = 1;
  firstRevision.layers.base = "assets/gate-fixture-r1.png";
  const complete = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#111318" } }).png().toBuffer();
  const metrics = await analyzeCompleteBase(complete, firstRevision);
  assert.equal(assertNoChromaSchema(firstRevision), true);
  assert.equal(assertCompleteBaseMetrics(firstRevision, metrics).pass, true);
});
