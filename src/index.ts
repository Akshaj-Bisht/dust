#!/usr/bin/env bun

import { Command } from "commander";
import { registerCleanCommand } from "./commands/clean";
import { registerScanCommand } from "./commands/scan";
import { startTui } from "./tui/app";
import { launchTuiInNewTerminal } from "./tui/launchTerminal";

const program = new Command();

program
  .name("dust")
  .description("Fast, minimal CLI tool to scan and clean disk space on Linux.")
  .version("1.0.0")
  .showHelpAfterError("(use --help for usage)")
  .addHelpText(
    "after",
    `
Examples:
  $ dust scan
  $ dust scan ~/code --top 20 --engine du
  $ dust scan ~ --interactive
  $ dust clean all --dry-run
  $ dust clean cache --yes
`,
  );

registerScanCommand(program);
registerCleanCommand(program);

const rawArgv = process.argv.slice(2);
const argv = rawArgv.filter((arg) => arg !== "--tui-child");
const isTuiChild = rawArgv.includes("--tui-child") || process.env.DUST_TUI_CHILD === "1";

if (argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
  const shouldOpenNewWindow = process.env.DUST_OPEN_NEW_WINDOW === "1";
  if (shouldOpenNewWindow && !isTuiChild && launchTuiInNewTerminal()) {
    process.exit(0);
  }
  await startTui();
} else {
  program.parse([process.argv[0] ?? "bun", process.argv[1] ?? "dust", ...argv]);
}