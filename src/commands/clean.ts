import { cancel, confirm, intro, isCancel, outro } from "@clack/prompts";
import { Command } from "commander";
import { formatBytes } from "../lib/format";
import { CleanTargetName, runCleanup } from "../lib/cleanTargets";

type CleanCliOptions = {
  dryRun?: boolean;
  yes?: boolean;
  staleDays: string;
  verbose?: boolean;
};

const VALID_TARGETS: CleanTargetName[] = ["cache", "tmp", "logs", "all"];

const isValidTarget = (target: string): target is CleanTargetName => {
  return VALID_TARGETS.includes(target as CleanTargetName);
};

export const registerCleanCommand = (program: Command): void => {
  program
    .command("clean")
    .description("Clean cache, temp files, and logs safely")
    .argument("[target]", "Target to clean (cache|tmp|logs|all)", "all")
    .option("--dry-run", "Preview cleanup without deleting")
    .option("--yes", "Skip confirmation prompt")
    .option("--stale-days <days>", "Delete files older than N days for tmp/logs", "3")
    .option("--verbose", "Print skipped paths and reasons")
    .action(async (targetInput: string, options: CleanCliOptions) => {
      if (!isValidTarget(targetInput)) {
        console.error(`Invalid clean target: ${targetInput}`);
        console.error("Allowed targets: cache, tmp, logs, all");
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
      const preview = await runCleanup(targetInput, {
        dryRun: true,
        staleDays,
        verbose: options.verbose ?? false,
      });

      console.log(
        `Found ${preview.candidates.length} cleanup candidates (${formatBytes(preview.reclaimedBytes)} reclaimable).`,
      );

      if (preview.candidates.length === 0) {
        outro("No cleanup needed.");
        return;
      }

      if (options.dryRun) {
        outro("Dry run complete. No files were deleted.");
        return;
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
      });

      console.log(`Deleted items: ${result.deletedCount}`);
      console.log(`Space reclaimed: ${formatBytes(result.reclaimedBytes)}`);
      if (result.skipped.length > 0) {
        console.log(`Skipped items: ${result.skipped.length}`);
      }
      outro("Cleanup complete.");
    });
};
