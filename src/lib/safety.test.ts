import { describe, expect, it } from "bun:test";
import {
  defaultAllowedCleanupRoots,
  ensureSafeDeletePath,
  isCriticalPath,
  isWithinPath,
} from "./safety";

describe("safety helpers", () => {
  it("flags critical system paths", () => {
    expect(isCriticalPath("/")).toBe(true);
    expect(isCriticalPath("/usr")).toBe(true);
    expect(isCriticalPath("/tmp")).toBe(false);
  });

  it("validates subpath relationship", () => {
    expect(isWithinPath("/tmp", "/tmp/test/file.log")).toBe(true);
    expect(isWithinPath("/tmp", "/var/tmp/file.log")).toBe(false);
  });

  it("allows only safe deletion roots", () => {
    const allowed = ["/tmp", "/home/demo/.cache"];
    expect(ensureSafeDeletePath("/tmp/cache-file", allowed)).toEqual({ ok: true });

    const denied = ensureSafeDeletePath("/etc/passwd", allowed);
    expect(denied.ok).toBe(false);
  });

  it("returns expected default allowed roots", () => {
    const roots = defaultAllowedCleanupRoots();
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.includes("/tmp")).toBe(true);
  });
});
