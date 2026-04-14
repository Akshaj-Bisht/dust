import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { defaultAllowedCleanupRoots, ensureSafeDeletePath } from "./safety";

export type CleanTargetName = "cache" | "tmp" | "logs" | "all";

export type CleanOptions = {
  dryRun: boolean;
  staleDays: number;
  verbose: boolean;
};

type CandidateItem = {
  path: string;
  sizeBytes: number;
};

export type CleanResult = {
  deletedCount: number;
  reclaimedBytes: number;
  skipped: Array<{ path: string; reason: string }>;
  candidates: CandidateItem[];
};

const maybeReadDir = async (targetPath: string): Promise<string[]> => {
  try {
    return await fs.readdir(targetPath);
  } catch {
    return [];
  }
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
  predicate?: (entryPath: string, stat: Awaited<ReturnType<typeof fs.lstat>>) => boolean,
): Promise<CandidateItem[]> => {
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

    if (predicate && !predicate(entryPath, stat)) {
      continue;
    }

    const sizeBytes = await collectItemSize(entryPath);
    if (sizeBytes > 0) {
      results.push({ path: entryPath, sizeBytes });
    }
  }

  return results;
};

const cacheCandidates = async (): Promise<CandidateItem[]> => {
  const cacheRoot = path.join(os.homedir(), ".cache");
  return collectChildren(cacheRoot);
};

const tmpCandidates = async (staleDays: number): Promise<CandidateItem[]> => {
  const staleCutoffMs = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  return collectChildren("/tmp", (_entryPath, stat) => stat.mtimeMs <= staleCutoffMs);
};

const logCandidates = async (staleDays: number): Promise<CandidateItem[]> => {
  const staleCutoffMs = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const userLogsRoot = path.join(os.homedir(), ".local", "state");
  const userLogs = await collectChildren(userLogsRoot, (_entryPath, stat) => stat.mtimeMs <= staleCutoffMs);
  const systemLogs = await collectChildren("/var/log", (_entryPath, stat) => stat.mtimeMs <= staleCutoffMs);
  return [...userLogs, ...systemLogs];
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
  return logCandidates(staleDays);
};

const toTargets = (target: CleanTargetName): Array<Exclude<CleanTargetName, "all">> => {
  if (target === "all") {
    return ["cache", "tmp", "logs"];
  }
  return [target];
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

  let deletedCount = 0;
  let reclaimedBytes = 0;
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const candidate of allCandidates) {
    const safeCheck = ensureSafeDeletePath(candidate.path, safeRoots);
    if (!safeCheck.ok) {
      skipped.push({ path: candidate.path, reason: safeCheck.reason });
      continue;
    }

    if (options.dryRun) {
      reclaimedBytes += candidate.sizeBytes;
      continue;
    }

    try {
      await fs.rm(candidate.path, { recursive: true, force: true });
      deletedCount += 1;
      reclaimedBytes += candidate.sizeBytes;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      skipped.push({ path: candidate.path, reason });
    }
  }

  if (options.verbose && skipped.length > 0) {
    for (const skip of skipped) {
      console.error(`[skip] ${skip.path} -> ${skip.reason}`);
    }
  }

  return {
    deletedCount,
    reclaimedBytes,
    skipped,
    candidates: allCandidates,
  };
};
