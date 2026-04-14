import path from "node:path";
import { promises as fs } from "node:fs";

type WalkOptions = {
  ignorePaths: Set<string>;
  onDirectorySize: (directoryPath: string, sizeBytes: number) => void;
  onError?: (directoryPath: string, error: unknown) => void;
};

type WalkResult = {
  totalBytes: number;
  filesScanned: number;
  directoriesScanned: number;
};

export const collectDirectorySizes = async (
  rootPath: string,
  options: WalkOptions,
): Promise<WalkResult> => {
  let filesScanned = 0;
  let directoriesScanned = 0;

  const walk = async (currentPath: string): Promise<number> => {
    let stat;
    try {
      stat = await fs.lstat(currentPath);
    } catch (error) {
      options.onError?.(currentPath, error);
      return 0;
    }

    if (stat.isFile()) {
      filesScanned += 1;
      return stat.size;
    }

    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      return 0;
    }

    const normalizedPath = path.resolve(currentPath);
    if (options.ignorePaths.has(normalizedPath) && normalizedPath !== path.resolve(rootPath)) {
      return 0;
    }

    directoriesScanned += 1;
    let totalSize = 0;

    let entries: string[];
    try {
      entries = await fs.readdir(currentPath);
    } catch (error) {
      options.onError?.(currentPath, error);
      return 0;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry);
      totalSize += await walk(entryPath);
    }

    options.onDirectorySize(normalizedPath, totalSize);
    return totalSize;
  };

  const totalBytes = await walk(rootPath);

  return {
    totalBytes,
    filesScanned,
    directoriesScanned,
  };
};
