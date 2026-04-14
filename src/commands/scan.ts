import os from "node:os";
import path from "node:path";
import { intro, isCancel, outro, select, spinner } from "@clack/prompts";
import { Command } from "commander";
import { runDuScan } from "../lib/duScan";
import { collectDirectorySizes } from "../lib/fsWalk";
import { asAbsolutePath, formatBytes } from "../lib/format";
import { buildCleanupHints, selectTopEntries } from "../lib/scanPresentation";

const DEFAULT_IGNORED_PATHS = ["/proc", "/sys", "/dev", "/run", "/snap", "/mnt", "/media"];

type ScanCliOptions = {
  top: string;
  depth: string;
  engine: "auto" | "du" | "walk";
  interactive?: boolean;
  raw?: boolean;
  json?: boolean;
  verbose?: boolean;
};

export const registerScanCommand = (program: Command): void => {
  program
    .command("scan")
    .description("Scan and report the largest folders")
    .argument("[scanPath]", "Path to scan", os.homedir())
    .option("--top <count>", "Top N folders to show", "10")
    .option("--depth <levels>", "Directory depth for du engine", "6")
    .option("--engine <name>", "Scan engine: auto|du|walk", "auto")
    .option("--interactive", "Interactive mode with folder picker")
    .option("--raw", "Show raw nested entries (no dedup)")
    .option("--json", "Output in JSON format")
    .option("--verbose", "Print non-fatal scan errors")
    .addHelpText(
      "after",
      `
Examples:
  $ dust scan
  $ dust scan ~/code --top 25
  $ dust scan ~ --engine du --depth 6
  $ dust scan ~ --interactive
  $ dust scan /var --json
`,
    )
    .action(async (scanPath: string, options: ScanCliOptions) => {
      const startedAt = performance.now();
      const rootPath = path.resolve(asAbsolutePath(scanPath));
      const topCount = Number.parseInt(options.top, 10);
      const maxDepth = Number.parseInt(options.depth, 10);
      const ui = spinner();

      if (!Number.isInteger(topCount) || topCount <= 0) {
        console.error("Invalid value for --top. It must be a positive integer.");
        process.exitCode = 1;
        return;
      }
      if (!Number.isInteger(maxDepth) || maxDepth < 0) {
        console.error("Invalid value for --depth. It must be 0 or a positive integer.");
        process.exitCode = 1;
        return;
      }
      if (!["auto", "du", "walk"].includes(options.engine)) {
        console.error("Invalid value for --engine. Allowed values: auto, du, walk.");
        process.exitCode = 1;
        return;
      }

      const directorySizes = new Map<string, number>();
      const errors: string[] = [];
      let filesScanned = 0;
      let directoriesScanned = 0;
      let totalBytes = 0;
      let usedEngine: "du" | "walk" = "walk";
      if (!options.json) {
        intro(`Dust scan -> ${rootPath}`);
        ui.start("Scanning directories...");
      }

      if (options.engine === "auto" || options.engine === "du") {
        const duResult = await runDuScan(rootPath, maxDepth);
        for (const entry of duResult.entries) {
          directorySizes.set(entry.path, entry.sizeBytes);
        }
        errors.push(...duResult.errors);
        directoriesScanned = duResult.directoriesScanned;
        totalBytes = duResult.totalBytes;

        if (duResult.entries.length > 0) {
          usedEngine = "du";
        } else if (options.engine === "du") {
          if (!options.json) {
            ui.stop("Scan failed.");
          }
          console.error("du scan failed and produced no output.");
          process.exitCode = 1;
          return;
        }
      }

      if (options.engine === "walk" || (options.engine === "auto" && usedEngine !== "du")) {
        usedEngine = "walk";
        directorySizes.clear();
        errors.length = 0;
        const ignored = new Set(DEFAULT_IGNORED_PATHS.map((ignoredPath) => path.resolve(ignoredPath)));

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
        filesScanned = summary.filesScanned;
        directoriesScanned = summary.directoriesScanned;
        totalBytes = summary.totalBytes;
      }
      if (!options.json) {
        ui.stop(`Scan completed with ${usedEngine} engine.`);
      }

      const sortedEntries = [...directorySizes.entries()].map(([directoryPath, sizeBytes]) => ({
        path: directoryPath,
        sizeBytes,
      }));
      const topEntries = selectTopEntries(sortedEntries, rootPath, topCount, options.raw ?? false);
      const largest = topEntries.map((entry, index) => ({
          rank: index + 1,
          path: entry.path,
          sizeBytes: entry.sizeBytes,
          sizeHuman: formatBytes(entry.sizeBytes),
        }));

      const elapsedMs = Math.round(performance.now() - startedAt);
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              rootPath,
              engine: usedEngine,
              elapsedMs,
              filesScanned,
              directoriesScanned,
              totalBytes,
              top: largest,
              cleanupHints: buildCleanupHints(directorySizes),
              errors,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`\nTop directories (${options.raw ? "raw nested" : "deduplicated"}):`);
        console.log("------------------------------------------------------------");
        for (const item of largest) {
          console.log(`${item.rank.toString().padStart(2, "0")}. ${item.sizeHuman.padStart(8)}  ${item.path}`);
        }
        const cleanupHints = buildCleanupHints(directorySizes);
        if (cleanupHints.length > 0) {
          console.log("");
          console.log("Potential cleanup opportunities:");
          console.log("------------------------------------------------------------");
          for (const hint of cleanupHints) {
            console.log(`✓ ${hint.label.padEnd(24, " ")} ${formatBytes(hint.sizeBytes).padStart(8)}  -> ${hint.command}`);
          }
        }
        console.log("");
        console.log("------------------------------------------------------------");
        console.log(`Scanned: ${directoriesScanned} dirs, ${filesScanned} files, ${elapsedMs}ms`);
        console.log(`Total observed size: ${formatBytes(totalBytes)}`);
        if (!options.raw) {
          console.log("Tip: use --raw to inspect nested heavy subdirectories.");
        }
        if (errors.length > 0) {
          console.log(`Skipped ${errors.length} paths due to permission or IO errors.`);
        }

        if (options.interactive && process.stdout.isTTY && largest.length > 0) {
          const pickedPath = await select({
            message: "Inspect one folder from the top list:",
            options: largest.slice(0, 20).map((entry) => ({
              label: `${entry.sizeHuman.padStart(8)}  ${entry.path}`,
              value: entry.path,
            })),
          });

          if (!isCancel(pickedPath)) {
            const pickedSize = directorySizes.get(pickedPath) ?? 0;
            console.log("");
            console.log("Selected folder");
            console.log("------------------------------------------------------------");
            console.log(`Path: ${pickedPath}`);
            console.log(`Size: ${formatBytes(pickedSize)}`);
            console.log(`Try: dust scan "${pickedPath}" --top 20 --raw`);
          }
        }

        outro("Scan finished.");
      }

      if (options.verbose && errors.length > 0) {
        for (const error of errors) {
          console.error(`[scan:error] ${error}`);
        }
      }
    });
};
