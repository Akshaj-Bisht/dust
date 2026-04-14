type DuEntry = {
  path: string;
  sizeBytes: number;
};

export type DuScanResult = {
  entries: DuEntry[];
  directoriesScanned: number;
  totalBytes: number;
  errors: string[];
};

export const parseDuOutput = (output: string): DuEntry[] => {
  const entries: DuEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (!match) {
      continue;
    }

    const sizeText = match[1];
    const parsedPath = match[2];
    if (!sizeText || !parsedPath) {
      continue;
    }

    const sizeKb = Number.parseInt(sizeText, 10);
    if (!Number.isFinite(sizeKb)) {
      continue;
    }

    entries.push({
      sizeBytes: sizeKb * 1024,
      path: parsedPath,
    });
  }

  return entries;
};

export const runDuScan = async (
  rootPath: string,
  maxDepth: number,
): Promise<DuScanResult> => {
  const proc = Bun.spawn({
    cmd: ["du", "-x", "-k", "-d", String(maxDepth), rootPath],
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const entries = parseDuOutput(stdout);

  const errors = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (exitCode !== 0 && entries.length === 0) {
    errors.unshift(`du exited with code ${exitCode}`);
  }

  const rootEntry = entries.find((entry) => entry.path === rootPath);

  return {
    entries,
    directoriesScanned: entries.length,
    totalBytes: rootEntry?.sizeBytes ?? 0,
    errors,
  };
};
