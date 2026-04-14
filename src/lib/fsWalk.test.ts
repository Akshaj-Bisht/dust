import { afterEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectDirectorySizes } from "./fsWalk";

const testRoots: string[] = [];

const createFixture = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dust-fswalk-"));
  testRoots.push(root);

  await fs.mkdir(path.join(root, "a"), { recursive: true });
  await fs.mkdir(path.join(root, "b"), { recursive: true });
  await Bun.write(path.join(root, "a", "one.bin"), new Uint8Array(128));
  await Bun.write(path.join(root, "b", "two.bin"), new Uint8Array(256));

  return root;
};

afterEach(async () => {
  for (const root of testRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe("collectDirectorySizes", () => {
  it("collects size and summary data", async () => {
    const root = await createFixture();
    const sizes = new Map<string, number>();

    const summary = await collectDirectorySizes(root, {
      ignorePaths: new Set(),
      onDirectorySize: (directoryPath, sizeBytes) => {
        sizes.set(directoryPath, sizeBytes);
      },
    });

    expect(summary.filesScanned).toBe(2);
    expect(summary.directoriesScanned).toBeGreaterThanOrEqual(3);
    expect(summary.totalBytes).toBe(384);
    expect(Math.max(...sizes.values())).toBe(384);
  });
});
