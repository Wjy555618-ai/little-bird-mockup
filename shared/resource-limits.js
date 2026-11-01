(function attachMockupResourceLimits(global) {
  "use strict";

  const MAX_CATALOG_IMAGE_CACHE_ENTRIES = 8;
  const MAX_CATALOG_PREFETCH_ASSETS = 3;

  function requireMap(cache) {
    if (!(cache instanceof Map)) throw new TypeError("资源缓存必须是 Map");
  }

  function readLru(cache, key) {
    requireMap(cache);
    if (!cache.has(key)) return undefined;
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function writeLru(cache, key, value, limit = MAX_CATALOG_IMAGE_CACHE_ENTRIES) {
    requireMap(cache);
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("缓存上限必须是正整数");
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    return value;
  }

  function deleteIfSame(cache, key, value) {
    requireMap(cache);
    if (cache.get(key) === value) cache.delete(key);
  }

  function nearestAssets(items, selectedId, limit = MAX_CATALOG_PREFETCH_ASSETS) {
    if (!Array.isArray(items)) throw new TypeError("素材列表必须是数组");
    if (!Number.isInteger(limit) || limit < 0) throw new RangeError("预取上限必须是非负整数");
    if (limit === 0 || items.length < 2) return [];
    const selectedIndex = Math.max(0, items.findIndex((asset) => asset?.id === selectedId));
    return items
      .map((asset, index) => ({ asset, index, distance: Math.abs(index - selectedIndex) }))
      .filter(({ index }) => index !== selectedIndex)
      .sort((left, right) => left.distance - right.distance || left.index - right.index)
      .slice(0, limit)
      .map(({ asset }) => asset);
  }

  global.MockupResourceLimits = Object.freeze({
    MAX_CATALOG_IMAGE_CACHE_ENTRIES,
    MAX_CATALOG_PREFETCH_ASSETS,
    readLru,
    writeLru,
    deleteIfSame,
    nearestAssets
  });
})(window);
