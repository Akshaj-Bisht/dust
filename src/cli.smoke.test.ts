import { describe, expect, it } from "bun:test";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

describe("dust cli smoke", () => {
  it("runs scan with json output", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dust-smoke-"));
    await Bun.write(path.join(root, "sample.bin"), new Uint8Array(64));

    const process = Bun.spawnSync({
      cmd: ["bun", "run", "src/index.ts", "scan", root, "--top", "3", "--json"],
      cwd: path.resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

    await fs.rm(root, { recursive: true, force: true });

    expect(process.exitCode).toBe(0);
    const output = process.stdout.toString();
    expect(output).toContain('"top"');
  });

  it(
    "runs clean in dry-run mode",
    () => {
    const process = Bun.spawnSync({
      cmd: ["bun", "run", "src/index.ts", "clean", "cache", "--dry-run", "--stale-days", "1"],
      cwd: path.resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

      expect(process.exitCode).toBe(0);
      const output = process.stdout.toString();
      expect(output).toContain("Dry run complete");
    },
    90_000,
  );
});
