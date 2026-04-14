import { describe, expect, it } from "bun:test";
import os from "node:os";
import path from "node:path";
import { buildCleanupHints, selectTopEntries } from "../src/lib/scanPresentation";

describe("selectTopEntries", () => {
  it("deduplicates nested heavy directories by default", () => {
    const entries = [
      { path: "/home/user", sizeBytes: 10_000 },
      { path: "/home/user/.cache", sizeBytes: 5_000 },
      { path: "/home/user/.cache/app", sizeBytes: 4_000 },
      { path: "/home/user/code", sizeBytes: 3_000 },
    ];
    const top = selectTopEntries(entries, "/home/user", 3, false);
    expect(top.map((item) => item.path)).toEqual(["/home/user/.cache", "/home/user/code"]);
  });

  it("keeps nested entries in raw mode", () => {
    const entries = [
      { path: "/home/user", sizeBytes: 10_000 },
      { path: "/home/user/.cache", sizeBytes: 5_000 },
      { path: "/home/user/.cache/app", sizeBytes: 4_000 },
    ];
    const top = selectTopEntries(entries, "/home/user", 3, true);
    expect(top.map((item) => item.path)).toEqual([
      "/home/user/.cache",
      "/home/user/.cache/app",
    ]);
  });
});

describe("buildCleanupHints", () => {
  it("creates cleanup hints from known paths", () => {
    const home = os.homedir();
    const sizeMap = new Map<string, number>([
      [path.join(home, ".cache"), 2_000_000],
      [path.join(home, ".bun"), 1_000_000],
      [path.join(home, ".local", "share", "Trash"), 500_000],
    ]);

    const hints = buildCleanupHints(sizeMap);
    expect(hints.length).toBeGreaterThan(0);
  });
});
