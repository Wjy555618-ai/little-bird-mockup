(function attachMockupAssetCardHover(global) {
  "use strict";

  const MIN_ROTATION_DEGREES = 1.8;
  const MAX_ROTATION_DEGREES = 2.7;

  function unitInterval(random) {
    const value = Number(random());
    if (!Number.isFinite(value)) throw new TypeError("随机数生成器必须返回有限数字");
    return Math.max(0, Math.min(1, value));
  }

  function sampleRotation(random = Math.random) {
    const direction = unitInterval(random) < 0.5 ? -1 : 1;
    const magnitude = MIN_ROTATION_DEGREES
      + unitInterval(random) * (MAX_ROTATION_DEGREES - MIN_ROTATION_DEGREES);
    return Number((direction * magnitude).toFixed(2));
  }

  function enter(card, random = Math.random) {
    if (!card?.style || !card?.classList) throw new TypeError("悬停目标必须是卡片元素");
    if (card.classList.contains("is-hovered")) return Number(card.dataset.hoverRotation);
    const rotation = sampleRotation(random);
    card.dataset.hoverRotation = String(rotation);
    card.style.setProperty("--card-hover-rotation", `${rotation}deg`);
    card.classList.add("is-hovered");
    return rotation;
  }

  function leave(card) {
    if (!card?.style || !card?.classList) throw new TypeError("悬停目标必须是卡片元素");
    card.style.setProperty("--card-hover-rotation", "0deg");
    card.classList.remove("is-hovered");
    delete card.dataset.hoverRotation;
  }

  function crossedBoundary(card, relatedTarget) {
    if (!card || !relatedTarget || typeof card.contains !== "function") return true;
    try {
      return !card.contains(relatedTarget);
    } catch {
      return true;
    }
  }

  global.MockupAssetCardHover = Object.freeze({
    MIN_ROTATION_DEGREES,
    MAX_ROTATION_DEGREES,
    sampleRotation,
    enter,
    leave,
    crossedBoundary
  });
})(window);
