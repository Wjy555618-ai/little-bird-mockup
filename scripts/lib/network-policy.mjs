import { isIP } from "node:net";

const RESERVED_ROOTS = Object.freeze([
  "localhost",
  "example",
  "invalid",
  "test",
  "example.com",
  "example.net",
  "example.org"
]);

function normalizedHostname(hostname) {
  const lower = String(hostname || "").trim().toLowerCase().replace(/\.+$/, "");
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

export function isReservedOrLocalHostname(hostname) {
  const normalized = normalizedHostname(hostname);
  if (!normalized || isIP(normalized) !== 0) return true;
  return RESERVED_ROOTS.some((root) => normalized === root || normalized.endsWith(`.${root}`));
}

export function isPlausibleRemoteUrl(value) {
  const raw = String(value || "").trim();
  let hostname = "";
  const scpStyle = /^[^@\s]+@([^:\s]+):[^\s]+$/.exec(raw);
  if (scpStyle) {
    hostname = scpStyle[1];
  } else {
    try {
      const parsed = new URL(raw);
      if (!["https:", "ssh:", "git:"].includes(parsed.protocol)) return false;
      hostname = parsed.hostname;
    } catch {
      return false;
    }
  }
  return !isReservedOrLocalHostname(hostname);
}
