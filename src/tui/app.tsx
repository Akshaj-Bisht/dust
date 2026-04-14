import React, { useEffect, useState } from "react";
import { Box, render, useApp, useInput } from "ink";
import { promises as fs } from "node:fs";
import { runCleanup, type CleanTargetName } from "../lib/cleanTargets";
import { formatBytes } from "../lib/format";
import { runDuScan } from "../lib/duScan";
import { buildCleanupHints, selectTopEntries } from "../lib/scanPresentation";
import { Footer } from "./components/Footer";
import { HomeView } from "./components/HomeView";
import { CleanView } from "./components/CleanView";
import { LogView } from "./components/LogView";
import { ResultView } from "./components/ResultView";
import { CLEANUP_LOG_PATH, HELP_TEXT, MENU_ITEMS } from "./constants";
import type { CleanLine, MenuAction, TuiView } from "./types";

const DustTuiApp = (): React.JSX.Element => {
  const { exit } = useApp();
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<TuiView>("home");
  const [lastAction, setLastAction] = useState<MenuAction | null>(null);
  const [lastCommand, setLastCommand] = useState<string>("(none)");
  const [output, setOutput] = useState("Welcome to Dust.\nPress Enter on a menu item to run it.");
  const [cleanLines, setCleanLines] = useState<CleanLine[]>([]);
  const [cleanBusy, setCleanBusy] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [cleanStep, setCleanStep] = useState(0);
  const [cleanStepTotal, setCleanStepTotal] = useState(1);
  const [cleanStageLabel, setCleanStageLabel] = useState("Preparing");
  const [cleanReadyToApply, setCleanReadyToApply] = useState(false);
  const [cleanLastReclaimable, setCleanLastReclaimable] = useState(0);
  const [cleanLastItemCount, setCleanLastItemCount] = useState(0);
  const [scanBusy, setScanBusy] = useState(false);
  const [cleanScrollOffset, setCleanScrollOffset] = useState(0);
  const [cleanAutoFollow, setCleanAutoFollow] = useState(true);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logScrollOffset, setLogScrollOffset] = useState(0);

  const currentItem = MENU_ITEMS[selected] ?? MENU_ITEMS[0];
  if (!currentItem) {
    exit();
    return <Box />;
  }

  useEffect(() => {
    if (!cleanBusy) {
      return;
    }
    const timer = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % 4);
    }, 120);
    return () => clearInterval(timer);
  }, [cleanBusy]);

  useEffect(() => {
    if (!cleanAutoFollow) {
      return;
    }
    const maxVisibleLines = Math.max(8, (process.stdout.rows ?? 24) - 15);
    const maxScrollOffset = Math.max(0, cleanLines.length - maxVisibleLines);
    setCleanScrollOffset(maxScrollOffset);
  }, [cleanLines, cleanAutoFollow]);

  const appendCleanLine = (line: string, color?: CleanLine["color"]): void => {
    setCleanLines((prev) => [...prev, { text: line, color }]);
  };

  const loadCleanupLogView = async (): Promise<void> => {
    let lines: string[] = [];
    try {
      const content = await fs.readFile(CLEANUP_LOG_PATH, "utf8");
      const rows = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(-200);

      for (const row of rows) {
        try {
          const parsed = JSON.parse(row) as {
            at?: string;
            reclaimedBytes?: number;
            deletedCount?: number;
            removed?: Array<{ path: string; sizeBytes: number }>;
            skipped?: Array<{ path: string; reason: string }>;
          };
          const when = parsed.at ?? "(unknown time)";
          const freed = formatBytes(parsed.reclaimedBytes ?? 0);
          const deleted = parsed.deletedCount ?? 0;
          lines.push(`${when} | cleaned=${deleted} | freed=${freed}`);
          for (const item of (parsed.removed ?? []).slice(0, 5)) {
            lines.push(`  + ${item.path} (${formatBytes(item.sizeBytes)})`);
          }
          if ((parsed.removed ?? []).length > 5) {
            lines.push(`  + ... ${(parsed.removed?.length ?? 0) - 5} more`);
          }
          if ((parsed.skipped ?? []).length > 0) {
            lines.push(`  ! skipped ${(parsed.skipped ?? []).length} entries`);
          }
        } catch {
          lines.push(row);
        }
      }
    } catch {
      lines = ["No cleanup log found yet.", `Expected path: ${CLEANUP_LOG_PATH}`];
    }

    setLogLines(lines.length > 0 ? lines : ["No cleanup log entries found."]);
    setLogScrollOffset(Math.max(0, lines.length - 20));
    setView("log");
  };

  const runAnalyzeFlow = async (): Promise<void> => {
    setScanBusy(true);
    setLastAction("scan");
    setLastCommand("dust scan <home> --top 10");
    const home = process.env.HOME ?? process.cwd();
    const started = performance.now();

    try {
      const du = await runDuScan(home, 6);
      const sizeByPath = new Map<string, number>(du.entries.map((entry) => [entry.path, entry.sizeBytes]));
      const selected = selectTopEntries(du.entries, home, 10, false);
      const hints = buildCleanupHints(sizeByPath);

      const lines: string[] = [];
      lines.push(`Dust scan -> ${home} (engine: du)`);
      lines.push("");
      for (const [idx, entry] of selected.entries()) {
        lines.push(`${String(idx + 1).padStart(2, "0")}. ${formatBytes(entry.sizeBytes).padStart(8)}  ${entry.path}`);
      }
      if (hints.length > 0) {
        lines.push("");
        lines.push("Potential cleanup opportunities:");
        for (const hint of hints) {
          lines.push(`- ${hint.label.padEnd(24, " ")} ${formatBytes(hint.sizeBytes).padStart(8)}  -> ${hint.command}`);
        }
      }
      lines.push("");
      lines.push(`Scanned ${du.directoriesScanned} directories in ${Math.round(performance.now() - started)}ms`);
      lines.push(`Total observed size: ${formatBytes(du.totalBytes)}`);
      if (du.errors.length > 0) {
        lines.push(`Skipped ${du.errors.length} paths due to permission/IO errors.`);
      }

      setOutput(lines.join("\n"));
      setView("result");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutput(`Scan failed: ${message}`);
      setView("result");
    } finally {
      setScanBusy(false);
    }
  };

  const runCleanFlow = async (): Promise<void> => {
    const stages: Array<{ label: string; target: CleanTargetName }> = [
      { label: "User caches", target: "cache" },
      { label: "Temporary files", target: "tmp" },
      { label: "System logs", target: "logs" },
      { label: "Developer junk", target: "dev" },
    ];

    setView("cleaning");
    setCleanLines([]);
    setCleanBusy(true);
    setSpinnerFrame(0);
    setCleanStep(0);
    setCleanStepTotal(stages.length);
    setCleanStageLabel("Preparing");
    setCleanReadyToApply(false);
    setCleanLastReclaimable(0);
    setCleanLastItemCount(0);
    setCleanScrollOffset(0);
    setCleanAutoFollow(true);

    appendCleanLine("Clean Your Linux", "magenta");
    appendCleanLine("");
  
    if (typeof process.getuid === "function" && process.getuid() !== 0) {
      appendCleanLine("• System cleanup may require sudo access during apply.", "gray");
    }
    appendCleanLine("");

    let totalReclaimable = 0;
    let totalItems = 0;
    const merged = new Map<string, number>();

    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      if (!stage) {
        continue;
      }
      setCleanStageLabel(stage.label);
      setCleanStep(index);

      appendCleanLine(`▸ ${stage.label}`, "magenta");
      appendCleanLine(`  - Scanning ${stage.label.toLowerCase()}...`, "cyan");

      const stagePreview = await runCleanup(stage.target, {
        dryRun: true,
        staleDays: 3,
        verbose: false,
      });

      totalReclaimable += stagePreview.reclaimedBytes;
      totalItems += stagePreview.candidates.length;

      if (stagePreview.breakdown.length === 0) {
        appendCleanLine("  ✓ Nothing to clean", "green");
        appendCleanLine("");
        continue;
      }

      for (const item of stagePreview.breakdown) {
        const current = merged.get(item.label) ?? 0;
        merged.set(item.label, current + item.sizeBytes);
        appendCleanLine(`  ✓ ${item.label.padEnd(44, " ")} ${formatBytes(item.sizeBytes)}`, "green");
      }
      appendCleanLine("");
    }

    setCleanStep(stages.length);
    setCleanStageLabel("Done");
    setCleanBusy(false);
    setCleanReadyToApply(totalItems > 0);
    setCleanLastReclaimable(totalReclaimable);
    setCleanLastItemCount(totalItems);

    appendCleanLine("============================================================", "gray");
    appendCleanLine(
      `Cleanup scan complete | Reclaimable: ${formatBytes(totalReclaimable)} | Items: ${totalItems}`,
      "green",
    );
    if (totalItems > 0) {
      appendCleanLine("Press 'a' to apply cleanup", "yellow");
    } else {
      appendCleanLine("Nothing to clean.", "green");
    }
    appendCleanLine("============================================================", "gray");
  };

  const runApplyCleanFlow = async (): Promise<void> => {
    setCleanBusy(true);
    setCleanStageLabel("Applying cleanup");
    setCleanStep(0);
    setCleanStepTotal(Math.max(cleanLastItemCount, 1));

    appendCleanLine("");
    appendCleanLine("Applying cleanup...", "magenta");
    appendCleanLine("Safety checks: critical paths are protected before deletion.", "gray");

    const applyResult = await runCleanup("all", {
      dryRun: false,
      staleDays: 3,
      verbose: false,
      useSudo: true,
      onProgress: (event) => {
        if (event.phase === "start") {
          setCleanStep(0);
          setCleanStepTotal(Math.max(event.total, 1));
          setCleanStageLabel("Applying cleanup");
          return;
        }

        if (event.phase === "deleted") {
          setCleanStep(event.processed);
          if (event.path) {
            appendCleanLine(`  ✓ Deleted ${event.path} (${formatBytes(event.sizeBytes ?? 0)})`, "green");
          }
          return;
        }

        if (event.phase === "skipped") {
          setCleanStep(event.processed);
          if (event.path) {
            appendCleanLine(`  • Skipped ${event.path} (${event.reason ?? "unknown reason"})`, "yellow");
          }
          return;
        }

        if (event.phase === "done") {
          setCleanStep(event.total);
          setCleanStepTotal(Math.max(event.total, 1));
          setCleanStageLabel("Finalize");
        }
      },
    });

    setCleanBusy(false);
    setCleanReadyToApply(false);
    setCleanStep(Math.max(cleanLastItemCount, 1));
    setCleanStageLabel("Done");

    appendCleanLine("------------------------------------------------------------", "gray");
    appendCleanLine(`✓ Items cleaned: ${applyResult.deletedCount}`, "green");
    appendCleanLine(`✓ Space freed: ${formatBytes(applyResult.reclaimedBytes)}`, "green");
    appendCleanLine(`✓ Removed entries logged: ${applyResult.removed.length}`, "green");
    if (applyResult.skipped.length > 0) {
      appendCleanLine(`• Skipped items: ${applyResult.skipped.length}`, "yellow");
    }
    if (applyResult.logFilePath) {
      appendCleanLine(`Log saved: ${applyResult.logFilePath}`, "cyan");
    }
    appendCleanLine("Cleanup apply complete.", "green");
    appendCleanLine("------------------------------------------------------------", "gray");
  };

  useInput((input, key) => {
    if (input === "q") {
      if (view === "result" || view === "cleaning") {
        setView("home");
        return;
      }
      exit();
      return;
    }

    if (view === "cleaning") {
      const maxVisibleLines = Math.max(8, (process.stdout.rows ?? 24) - 15);
      const maxScrollOffset = Math.max(0, cleanLines.length - maxVisibleLines);

      if (key.upArrow || input === "k") {
        setCleanAutoFollow(false);
        setCleanScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCleanScrollOffset((prev) => {
          const next = Math.min(maxScrollOffset, prev + 1);
          if (next >= maxScrollOffset) {
            setCleanAutoFollow(true);
          }
          return next;
        });
        return;
      }
      if (input === "g") {
        setCleanAutoFollow(false);
        setCleanScrollOffset(0);
        return;
      }
      if (input === "G") {
        setCleanAutoFollow(true);
        setCleanScrollOffset(maxScrollOffset);
        return;
      }

      if (!cleanBusy && cleanReadyToApply && input === "a") {
        appendCleanLine("", "gray");
        appendCleanLine(
          `Applying cleanup for ${cleanLastItemCount} items (${formatBytes(cleanLastReclaimable)})...`,
          "yellow",
        );
        void runApplyCleanFlow();
        return;
      }
      if (input === "l") {
        void loadCleanupLogView();
        return;
      }
      return;
    }

    if (view === "log") {
      const maxVisibleLines = Math.max(8, (process.stdout.rows ?? 24) - 12);
      const maxScrollOffset = Math.max(0, logLines.length - maxVisibleLines);

      if (key.upArrow || input === "k") {
        setLogScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setLogScrollOffset((prev) => Math.min(maxScrollOffset, prev + 1));
        return;
      }
      if (input === "g") {
        setLogScrollOffset(0);
        return;
      }
      if (input === "G") {
        setLogScrollOffset(maxScrollOffset);
        return;
      }
      return;
    }

    if (view !== "home") {
      return;
    }

    if (scanBusy || cleanBusy) {
      return;
    }

    if (key.upArrow || input === "k") {
      setSelected((prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
      return;
    }

    if (key.downArrow || input === "j") {
      setSelected((prev) => (prev + 1) % MENU_ITEMS.length);
      return;
    }

    if (!key.return) {
      return;
    }

    if (currentItem.id === "exit") {
      exit();
      return;
    }

    if (currentItem.id === "help") {
      setLastAction("help");
      setLastCommand("help");
      setOutput(HELP_TEXT);
      setView("result");
      return;
    }

    if (currentItem.id === "scan") {
      void runAnalyzeFlow();
      return;
    }

    if (currentItem.id === "clean") {
      setLastAction("clean");
      setLastCommand("dust clean all --dry-run");
      void runCleanFlow();
      return;
    }

    if (currentItem.id === "uninstall") {
      setLastAction("uninstall");
      setLastCommand("dust uninstall <app> --dry-run");
      setOutput("Uninstall flow is planned.\nThis section will show package details and remove-confirm steps.");
      setView("result");
      return;
    }

    if (currentItem.id === "optimize") {
      setLastAction("optimize");
      setLastCommand("dust optimize --dry-run");
      setOutput("Optimize flow is planned.\nThis section will include safe system maintenance actions.");
      setView("result");
      return;
    }

    if (currentItem.id === "status") {
      setLastAction("status");
      setLastCommand("dust status");
      setOutput("Status monitor is planned.\nThis section will show CPU, RAM, disk, and network metrics.");
      setView("result");
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {view === "home" ? <HomeView menuItems={MENU_ITEMS} selected={selected} /> : null}
      {view === "cleaning" ? (
        <CleanView
          cleanBusy={cleanBusy}
          spinnerFrame={spinnerFrame}
          cleanStageLabel={cleanStageLabel}
          cleanStep={cleanStep}
          cleanStepTotal={cleanStepTotal}
          cleanLines={cleanLines}
          cleanAutoFollow={cleanAutoFollow}
          cleanScrollOffset={cleanScrollOffset}
        />
      ) : null}
      {view === "log" ? <LogView logPath={CLEANUP_LOG_PATH} logLines={logLines} logScrollOffset={logScrollOffset} /> : null}
      {view === "result" ? <ResultView lastAction={lastAction} lastCommand={lastCommand} output={output} /> : null}

      <Footer view={view} cleanReadyToApply={cleanReadyToApply} />
    </Box>
  );
};

export const startTui = async (): Promise<void> => {
  const useAlternateScreen = process.stdout.isTTY;
  if (useAlternateScreen) {
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H");
  }

  const app = render(<DustTuiApp />);
  try {
    await app.waitUntilExit();
  } finally {
    if (useAlternateScreen) {
      process.stdout.write("\x1b[?1049l");
    }
  }
};
