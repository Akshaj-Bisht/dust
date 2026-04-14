import { describe, expect, it } from "bun:test";
import { parseDuOutput } from "../src/lib/duScan";

describe("parseDuOutput", () => {
  it("parses du output into byte entries", () => {
    const parsed = parseDuOutput("12\t/tmp/a\n2048\t/tmp/b\n");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ path: "/tmp/a", sizeBytes: 12 * 1024 });
    expect(parsed[1]).toEqual({ path: "/tmp/b", sizeBytes: 2048 * 1024 });
  });

  it("skips malformed rows", () => {
    const parsed = parseDuOutput("bad-row\n15\t/tmp/c\n");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toBeDefined();
    expect(parsed[0]?.path).toBe("/tmp/c");
  });
});
