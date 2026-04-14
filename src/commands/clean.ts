import { cancel, confirm, intro, isCancel, outro } from "@clack/prompts";
import { Command } from "commander";
import { formatBytes } from "../lib/format";
import { runCleanup } from "../lib/cleanTargets";
import type { CleanTargetName } from "../lib/cleanTargets";

type CleanCliOptions = {
  dryRun?: boolean;
  yes?: boolean;
  staleDays: string;
  verbose?: boolean;
};

const VALID_TARGETS: CleanTargetName[] = ["cache", "tmp", "logs", "dev", "all"];

const isValidTarget = (target: string): target is CleanTargetName => {
  return VALID_TARGETS.includes(target as CleanTargetName);
};

export const registerCleanCommand = (program: Command): void => {
  program
    .command("clean")
    .description("Clean cache, temp files, and logs safely")
    .argument("[target]", "Target to clean (cache|tmp|logs|dev|all)", "all")
    .option("--dry-run", "Preview cleanup without deleting")
    .option("--yes", "Skip confirmation prompt")
    .option("--stale-days <days>", "Delete files older than N days for tmp/logs", "3")
    .option("--verbose", "Print skipped paths and reasons")
    .addHelpText(
      "after",
      `
Examples:
  $ dust clean all --dry-run
  $ dust clean cache --yes
  $ dust clean logs --stale-days 7 --dry-run
`,
    )
    .action(async (targetInput: string, options: CleanCliOptions) => {
      if (!isValidTarget(targetInput)) {
        console.error(`Invalid clean target: ${targetInput}`);
        console.error("Allowed targets: cache, tmp, logs, dev, all");
        process.exitCode = 1;
        return;
      }

      const staleDays = Number.parseInt(options.staleDays, 10);
      if (!Number.isInteger(staleDays) || staleDays < 0) {
        console.error("Invalid value for --stale-days. It must be 0 or a positive integer.");
        process.exitCode = 1;
        return;
      }

      intro(`Dust clean -> target=${targetInput}`);
      console.log("Scanning cache directories...\n");
      const preview = await runCleanup(targetInput, {
        dryRun: true,
        staleDays,
        verbose: options.verbose ?? false,
      });

      for (const item of preview.breakdown) {
        console.log(`  ✓ ${item.label.padEnd(55, " ")} ${formatBytes(item.sizeBytes).padStart(10, " ")}`);
      }
      console.log("");
      console.log(`Total reclaimable: ${formatBytes(preview.reclaimedBytes)}`);
      console.log(`Candidates found: ${preview.candidates.length}`);

      if (preview.candidates.length === 0) {
        outro("No cleanup needed.");
        return;
      }

      if (options.dryRun) {
        outro("Dry run complete. No files were deleted.");
        return;
      }

      const requiresSudo = preview.candidates.some((candidate) => candidate.path.startsWith("/var/log"));
      let useSudo = false;
      if (requiresSudo && typeof process.getuid === "function" && process.getuid() !== 0) {
        const sudoPrompt = await confirm({
          message: "Some selected cleanup paths need sudo. Continue and request password?",
          initialValue: true,
        });
        if (isCancel(sudoPrompt) || !sudoPrompt) {
          cancel("Cleanup cancelled.");
          process.exitCode = 1;
          return;
        }

        const sudoCheck = Bun.spawnSync({
          cmd: ["sudo", "-v"],
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
        if (sudoCheck.exitCode !== 0) {
          cancel("Failed to acquire sudo credentials.");
          process.exitCode = 1;
          return;
        }
        useSudo = true;
      }

      let shouldProceed = options.yes ?? false;
      if (!shouldProceed) {
        const confirmed = await confirm({
          message: `Delete ${preview.candidates.length} items and reclaim ~${formatBytes(preview.reclaimedBytes)}?`,
        });

        if (isCancel(confirmed)) {
          cancel("Cleanup cancelled.");
          process.exitCode = 1;
          return;
        }

        shouldProceed = confirmed;
      }

      if (!shouldProceed) {
        outro("Cleanup skipped.");
        return;
      }

      const result = await runCleanup(targetInput, {
        dryRun: false,
        staleDays,
        verbose: options.verbose ?? false,
        useSudo,
      });

      console.log(`Deleted items: ${result.deletedCount}`);
      console.log(`Space reclaimed: ${formatBytes(result.reclaimedBytes)}`);
      if (result.removed.length > 0) {
        console.log("Removed paths:");
        for (const item of result.removed.slice(0, 25)) {
          console.log(`  - ${item.path} (${formatBytes(item.sizeBytes)})`);
        }
        if (result.removed.length > 25) {
          console.log(`  ... and ${result.removed.length - 25} more`);
        }
      }
      if (result.skipped.length > 0) {
        console.log(`Skipped items: ${result.skipped.length}`);
      }
      if (result.logFilePath) {
        console.log(`Cleanup log: ${result.logFilePath}`);
      }
      outro("Cleanup complete.");
    });
};
