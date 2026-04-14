import os from "node:os";
import path from "node:path";

export type ScanEntry = {
  path: string;
  sizeBytes: number;
};

export type CleanupHint = {
  label: string;
  sizeBytes: number;
  command: string;
};

const isWithin = (parentPath: string, childPath: string): boolean => {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(`${parent}/`);
};

export const selectTopEntries = (
  entries: ScanEntry[],
  rootPath: string,
  limit: number,
  raw: boolean,
): ScanEntry[] => {
  const root = path.resolve(rootPath);
  const sorted = [...entries]
    .filter((entry) => path.resolve(entry.path) !== root)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  if (raw) {
    return sorted.slice(0, limit);
  }

  const selected: ScanEntry[] = [];
  for (const entry of sorted) {
    if (selected.some((picked) => isWithin(picked.path, entry.path))) {
      continue;
    }
    selected.push(entry);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
};

const pickSizeFromMap = (sizeByPath: Map<string, number>, probePath: string): number => {
  const exact = sizeByPath.get(path.resolve(probePath));
  if (exact !== undefined) {
    return exact;
  }

  let best = 0;
  const prefix = `${path.resolve(probePath)}/`;
  for (const [entryPath, entrySize] of sizeByPath.entries()) {
    if (entryPath.startsWith(prefix)) {
      best = Math.max(best, entrySize);
    }
  }
  return best;
};

export const buildCleanupHints = (sizeByPath: Map<string, number>): CleanupHint[] => {
  const home = os.homedir();
  const hints: CleanupHint[] = [
    {
      label: "User app cache",
      sizeBytes: pickSizeFromMap(sizeByPath, path.join(home, ".cache")),
      command: "dust clean cache --dry-run",
    },
    {
      label: "Developer tool caches",
      sizeBytes:
        pickSizeFromMap(sizeByPath, path.join(home, ".bun")) +
        pickSizeFromMap(sizeByPath, path.join(home, ".npm")) +
        pickSizeFromMap(sizeByPath, path.join(home, ".cargo")),
      command: "dust clean cache --dry-run",
    },
    {
      label: "Temp files",
      sizeBytes: pickSizeFromMap(sizeByPath, "/tmp"),
      command: "dust clean tmp --dry-run",
    },
    {
      label: "Logs",
      sizeBytes:
        pickSizeFromMap(sizeByPath, "/var/log") +
        pickSizeFromMap(sizeByPath, path.join(home, ".local", "state")),
      command: "dust clean logs --dry-run",
    },
    {
      label: "Trash",
      sizeBytes: pickSizeFromMap(sizeByPath, path.join(home, ".local", "share", "Trash")),
      command: "dust clean all --dry-run",
    },
  ];

  return hints.filter((hint) => hint.sizeBytes > 0).sort((a, b) => b.sizeBytes - a.sizeBytes);
};
