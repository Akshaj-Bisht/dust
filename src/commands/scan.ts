import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { collectDirectorySizes } from "../lib/fsWalk";
import { asAbsolutePath, formatBytes } from "../lib/format";

const DEFAULT_IGNORED_PATHS = ["/proc", "/sys", "/dev", "/run", "/snap", "/mnt", "/media"];

type ScanCliOptions = {
  top: string;
  json?: boolean;
  verbose?: boolean;
};

export const registerScanCommand = (program: Command): void => {
  program
    .command("scan")
    .description("Scan and report the largest folders")
    .argument("[scanPath]", "Path to scan", os.homedir())
    .option("--top <count>", "Top N folders to show", "10")
    .option("--json", "Output in JSON format")
    .option("--verbose", "Print non-fatal scan errors")
    .action(async (scanPath: string, options: ScanCliOptions) => {
      const startedAt = performance.now();
      const rootPath = path.resolve(asAbsolutePath(scanPath));
      const topCount = Number.parseInt(options.top, 10);

      if (!Number.isInteger(topCount) || topCount <= 0) {
        console.error("Invalid value for --top. It must be a positive integer.");
        process.exitCode = 1;
        return;
      }

      const ignored = new Set(DEFAULT_IGNORED_PATHS.map((ignoredPath) => path.resolve(ignoredPath)));
      const directorySizes = new Map<string, number>();
      const errors: string[] = [];

      const summary = await collectDirectorySizes(rootPath, {
        ignorePaths: ignored,
        onDirectorySize: (directoryPath, sizeBytes) => {
          directorySizes.set(directoryPath, sizeBytes);
        },
        onError: (directoryPath, error) => {
          const reason = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${directoryPath}: ${reason}`);
        },
      });

      const largest = [...directorySizes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topCount)
        .map(([directoryPath, sizeBytes], index) => ({
          rank: index + 1,
          path: directoryPath,
          sizeBytes,
          sizeHuman: formatBytes(sizeBytes),
        }));

      const elapsedMs = Math.round(performance.now() - startedAt);
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              rootPath,
              elapsedMs,
              filesScanned: summary.filesScanned,
              directoriesScanned: summary.directoriesScanned,
              totalBytes: summary.totalBytes,
              top: largest,
              errors,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`Dust scan -> ${rootPath}`);
        for (const item of largest) {
          console.log(`${item.rank.toString().padStart(2, "0")}. ${item.sizeHuman.padStart(8)}  ${item.path}`);
        }
        console.log("");
        console.log(
          `Scanned ${summary.directoriesScanned} directories, ${summary.filesScanned} files in ${elapsedMs}ms`,
        );
        console.log(`Total observed size: ${formatBytes(summary.totalBytes)}`);
        if (errors.length > 0) {
          console.log(`Skipped ${errors.length} paths due to permission or IO errors.`);
        }
      }

      if (options.verbose && errors.length > 0) {
        for (const error of errors) {
          console.error(`[scan:error] ${error}`);
        }
      }
    });
};
