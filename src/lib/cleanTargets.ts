import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { defaultAllowedCleanupRoots, ensureSafeDeletePath } from "./safety";

export type CleanTargetName = "cache" | "tmp" | "logs" | "dev" | "all";

export type CleanOptions = {
  dryRun: boolean;
  staleDays: number;
  verbose: boolean;
  useSudo?: boolean;
  onProgress?: (event: {
    phase: "start" | "deleted" | "skipped" | "done";
    processed: number;
    total: number;
    path?: string;
    reason?: string;
    sizeBytes?: number;
  }) => void;
};

type CandidateItem = {
  path: string;
  sizeBytes: number;
  category: string;
  requiresSudo: boolean;
  safeRoots?: string[];
};

export type CleanResult = {
  deletedCount: number;
  reclaimedBytes: number;
  skipped: Array<{ path: string; reason: string }>;
  removed: Array<{ path: string; sizeBytes: number }>;
  candidates: CandidateItem[];
  breakdown: Array<{ label: string; sizeBytes: number; count: number }>;
  logFilePath?: string;
};

const writeCleanupLog = async (
  payload: Record<string, unknown>,
): Promise<string | undefined> => {
  const logDir = path.join(os.homedir(), ".local", "state", "dust", "logs");
  const logFilePath = path.join(logDir, "cleanup.log");
  try {
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFilePath, `${JSON.stringify(payload)}\n`, "utf8");
    return logFilePath;
  } catch {
    return undefined;
  }
};

const maybeReadDir = async (targetPath: string): Promise<string[]> => {
  try {
    return await fs.readdir(targetPath);
  } catch {
    return [];
  }
};

const getChildSizesFromDu = async (rootPath: string): Promise<Map<string, number>> => {
  const sizes = new Map<string, number>();
  const proc = Bun.spawn({
    cmd: ["du", "-k", "-d", "1", rootPath],
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    return sizes;
  }

  for (const line of stdout.split("\n")) {
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
    sizes.set(path.resolve(parsedPath), sizeKb * 1024);
  }
  return sizes;
};

const collectItemSize = async (targetPath: string): Promise<number> => {
  let stat;
  try {
    stat = await fs.lstat(targetPath);
  } catch {
    return 0;
  }

  if (stat.isSymbolicLink()) {
    return 0;
  }

  if (stat.isFile()) {
    return stat.size;
  }

  if (!stat.isDirectory()) {
    return 0;
  }

  let total = 0;
  const entries = await maybeReadDir(targetPath);
  for (const entry of entries) {
    total += await collectItemSize(path.join(targetPath, entry));
  }
  return total;
};

const collectChildren = async (
  rootPath: string,
  category: string,
  predicate?: (entryPath: string, stat: Awaited<ReturnType<typeof fs.lstat>>) => boolean,
  classify?: (entryPath: string) => string,
  safeRoots?: string[],
): Promise<CandidateItem[]> => {
  const entries = await maybeReadDir(rootPath);
  const duSizes = await getChildSizesFromDu(rootPath);
  const resolvedRoot = path.resolve(rootPath);
  const maybeCandidates = await Promise.all(
    entries.map(async (entry): Promise<CandidateItem | null> => {
      const entryPath = path.join(rootPath, entry);
      let stat;
      try {
        stat = await fs.lstat(entryPath);
      } catch {
        return null;
      }

      if (stat.isSymbolicLink()) {
        return null;
      }

      if (predicate && !predicate(entryPath, stat)) {
        return null;
      }

      const resolvedPath = path.resolve(entryPath);
      const sizeBytes = duSizes.get(resolvedPath) ?? (await collectItemSize(entryPath));
      if (sizeBytes <= 0) {
        return null;
      }

      return {
        path: resolvedPath,
        sizeBytes,
        category: classify?.(resolvedPath) ?? category,
        requiresSudo: resolvedRoot.startsWith("/var/log") || resolvedRoot.startsWith("/tmp"),
        safeRoots,
      };
    }),
  );

  return maybeCandidates.filter((item): item is CandidateItem => item !== null);
};

const browserCachePatterns = ["chrome", "chromium", "firefox", "mozilla", "brave", "safari"];
const devCachePatterns = ["node", "npm", "bun", "cargo", "gradle", "m2", "go-build"];
const appSpecificPatterns = ["spotify", "dropbox", "slack", "discord", "telegram"];

const classifyCachePath = (entryPath: string): string => {
  const lowered = entryPath.toLowerCase();
  if (browserCachePatterns.some((pattern) => lowered.includes(pattern))) {
    return "Browser cache (Chrome, Safari, Firefox)";
  }
  if (devCachePatterns.some((pattern) => lowered.includes(pattern))) {
    return "Developer tools (Node.js, npm, Bun)";
  }
  if (appSpecificPatterns.some((pattern) => lowered.includes(pattern))) {
    return "App-specific cache (Spotify, Dropbox, Slack)";
  }
  return "User app cache";
};

const cacheCandidates = async (): Promise<CandidateItem[]> => {
  const cacheRoot = path.join(os.homedir(), ".cache");
  const home = os.homedir();
  const cacheItems = await collectChildren(cacheRoot, "User app cache", undefined, classifyCachePath);
  const devDirs = await Promise.all(
    [".bun", ".npm"].map(async (entry) => {
      const entryPath = path.join(home, entry);
      const sizeBytes = await collectItemSize(entryPath);
      return sizeBytes > 0
        ? ({
            path: entryPath,
            sizeBytes,
            category: "Developer tools (Node.js, npm, Bun)",
            requiresSudo: false,
            safeRoots: [home],
          } as CandidateItem)
        : null;
    }),
  );

  const trashPath = path.join(home, ".local", "share", "Trash");
  const trashSize = await collectItemSize(trashPath);
  const trashCandidate =
    trashSize > 0
      ? ({
          path: trashPath,
          sizeBytes: trashSize,
          category: "Trash",
          requiresSudo: false,
          safeRoots: [home],
        } as CandidateItem)
      : null;

  return [...cacheItems, ...devDirs.filter((item): item is CandidateItem => item !== null), ...(trashCandidate ? [trashCandidate] : [])];
};

const tmpCandidates = async (staleDays: number): Promise<CandidateItem[]> => {
  const staleCutoffMs = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  return collectChildren(
    "/tmp",
    "System logs and temp files",
    (_entryPath, stat) => stat.mtimeMs <= staleCutoffMs,
  );
};

const logCandidates = async (staleDays: number): Promise<CandidateItem[]> => {
  const staleCutoffMs = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const userLogsRoot = path.join(os.homedir(), ".local", "state");
  const userLogs = await collectChildren(
    userLogsRoot,
    "System logs and temp files",
    (_entryPath, stat) => stat.mtimeMs <= staleCutoffMs,
  );
  const systemLogs = await collectChildren(
    "/var/log",
    "System logs and temp files",
    (_entryPath, stat) => stat.mtimeMs <= staleCutoffMs,
  );
  return [...userLogs, ...systemLogs];
};

const DEV_JUNK_NAMES = new Set(["node_modules", "dist", "build", ".venv", "target", ".turbo"]);

const findDevJunkCandidates = async (
  rootPath: string,
  maxDepth: number,
  currentDepth = 0,
): Promise<CandidateItem[]> => {
  if (currentDepth > maxDepth) {
    return [];
  }

  const entries = await maybeReadDir(rootPath);
  const results: CandidateItem[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry);
    let stat;
    try {
      stat = await fs.lstat(entryPath);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      continue;
    }

    if (stat.isDirectory() && DEV_JUNK_NAMES.has(entry)) {
      const sizeBytes = await collectItemSize(entryPath);
      if (sizeBytes > 0) {
        results.push({
          path: entryPath,
          sizeBytes,
          category: "Developer junk (project artifacts)",
          requiresSudo: false,
          safeRoots: [process.cwd()],
        });
      }
      continue;
    }

    if (stat.isDirectory()) {
      const nested = await findDevJunkCandidates(entryPath, maxDepth, currentDepth + 1);
      results.push(...nested);
    }
  }

  return results;
};

const devCandidates = async (): Promise<CandidateItem[]> => {
  return findDevJunkCandidates(process.cwd(), 4);
};

const targetToCandidates = async (
  target: Exclude<CleanTargetName, "all">,
  staleDays: number,
): Promise<CandidateItem[]> => {
  if (target === "cache") {
    return cacheCandidates();
  }
  if (target === "tmp") {
    return tmpCandidates(staleDays);
  }
  if (target === "logs") {
    return logCandidates(staleDays);
  }
  return devCandidates();
};

const toTargets = (target: CleanTargetName): Array<Exclude<CleanTargetName, "all">> => {
  if (target === "all") {
    return ["cache", "tmp", "logs"];
  }
  return [target];
};

const dedupeCandidates = (candidates: CandidateItem[]): CandidateItem[] => {
  const byPath = new Map<string, CandidateItem>();

  for (const candidate of candidates) {
    const resolvedPath = path.resolve(candidate.path);
    const existing = byPath.get(resolvedPath);
    if (!existing) {
      byPath.set(resolvedPath, { ...candidate, path: resolvedPath });
      continue;
    }

    if (candidate.sizeBytes > existing.sizeBytes) {
      byPath.set(resolvedPath, { ...candidate, path: resolvedPath });
    }
  }

  return [...byPath.values()];
};

export const runCleanup = async (
  target: CleanTargetName,
  options: CleanOptions,
): Promise<CleanResult> => {
  const targets = toTargets(target);
  const safeRoots = defaultAllowedCleanupRoots();
  const allCandidates: CandidateItem[] = [];

  for (const targetName of targets) {
    const candidates = await targetToCandidates(targetName, options.staleDays);
    allCandidates.push(...candidates);
  }

  const uniqueCandidates = dedupeCandidates(allCandidates);

  let deletedCount = 0;
  let reclaimedBytes = 0;
  let processed = 0;
  const skipped: Array<{ path: string; reason: string }> = [];
  const removed: Array<{ path: string; sizeBytes: number }> = [];
  const breakdownMap = new Map<string, { sizeBytes: number; count: number }>();

  const addBreakdown = (category: string, sizeBytes: number): void => {
    const current = breakdownMap.get(category) ?? { sizeBytes: 0, count: 0 };
    current.sizeBytes += sizeBytes;
    current.count += 1;
    breakdownMap.set(category, current);
  };

  for (const candidate of uniqueCandidates) {
    addBreakdown(candidate.category, candidate.sizeBytes);
  }

  options.onProgress?.({
    phase: "start",
    processed: 0,
    total: uniqueCandidates.length,
  });

  for (const candidate of uniqueCandidates) {
    const candidateSafeRoots = candidate.safeRoots ?? [];
    const safeCheck = ensureSafeDeletePath(candidate.path, [...safeRoots, ...candidateSafeRoots]);
    if (!safeCheck.ok) {
      skipped.push({ path: candidate.path, reason: safeCheck.reason });
      processed += 1;
      options.onProgress?.({
        phase: "skipped",
        processed,
        total: uniqueCandidates.length,
        path: candidate.path,
        reason: safeCheck.reason,
      });
      continue;
    }

    if (options.dryRun) {
      reclaimedBytes += candidate.sizeBytes;
      processed += 1;
      options.onProgress?.({
        phase: "done",
        processed,
        total: uniqueCandidates.length,
        path: candidate.path,
        sizeBytes: candidate.sizeBytes,
      });
      continue;
    }

    if (options.useSudo && candidate.requiresSudo && typeof process.getuid === "function" && process.getuid() !== 0) {
      const sudoProc = Bun.spawnSync({
        cmd: ["sudo", "rm", "-rf", "--", candidate.path],
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      if (sudoProc.exitCode === 0) {
        deletedCount += 1;
        reclaimedBytes += candidate.sizeBytes;
        removed.push({ path: candidate.path, sizeBytes: candidate.sizeBytes });
        processed += 1;
        options.onProgress?.({
          phase: "deleted",
          processed,
          total: uniqueCandidates.length,
          path: candidate.path,
          sizeBytes: candidate.sizeBytes,
        });
        continue;
      }
      skipped.push({ path: candidate.path, reason: `sudo rm failed with exit code ${sudoProc.exitCode}` });
      processed += 1;
      options.onProgress?.({
        phase: "skipped",
        processed,
        total: uniqueCandidates.length,
        path: candidate.path,
        reason: `sudo rm failed with exit code ${sudoProc.exitCode}`,
      });
      continue;
    }

    try {
      await fs.rm(candidate.path, { recursive: true, force: true });
      deletedCount += 1;
      reclaimedBytes += candidate.sizeBytes;
      removed.push({ path: candidate.path, sizeBytes: candidate.sizeBytes });
      processed += 1;
      options.onProgress?.({
        phase: "deleted",
        processed,
        total: uniqueCandidates.length,
        path: candidate.path,
        sizeBytes: candidate.sizeBytes,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      skipped.push({ path: candidate.path, reason });
      processed += 1;
      options.onProgress?.({
        phase: "skipped",
        processed,
        total: uniqueCandidates.length,
        path: candidate.path,
        reason,
      });
    }
  }

  if (options.verbose && skipped.length > 0) {
    for (const skip of skipped) {
      console.error(`[skip] ${skip.path} -> ${skip.reason}`);
    }
  }

  const logFilePath =
    !options.dryRun
      ? await writeCleanupLog({
          at: new Date().toISOString(),
          target,
          deletedCount,
          reclaimedBytes,
          removed,
          skipped,
        })
      : undefined;

  options.onProgress?.({
    phase: "done",
    processed: uniqueCandidates.length,
    total: uniqueCandidates.length,
  });

  return {
    deletedCount,
    reclaimedBytes,
    skipped,
    removed,
    candidates: uniqueCandidates,
    breakdown: [...breakdownMap.entries()]
      .map(([label, value]) => ({ label, sizeBytes: value.sizeBytes, count: value.count }))
      .sort((a, b) => b.sizeBytes - a.sizeBytes),
    logFilePath,
  };
};
