import os from "node:os";
import path from "node:path";
import type { MenuAction } from "./types";

export const MENU_ITEMS: Array<{ id: MenuAction; label: string; hint: string }> = [
  { id: "clean", label: "Clean", hint: "Free up disk space" },
  { id: "uninstall", label: "Uninstall", hint: "Remove apps completely" },
  { id: "optimize", label: "Optimize", hint: "Check and maintain system" },
  { id: "scan", label: "Analyze", hint: "Explore disk usage" },
  { id: "status", label: "Status", hint: "Monitor system health" },
  { id: "help", label: "Help", hint: "Commands and docs" },
  { id: "exit", label: "Quit", hint: "Exit Dust" },
];

export const HELP_TEXT = [
  "Quick commands:",
  "  dust scan",
  "  dust clean all --dry-run",
  "  dust scan --help",
  "  dust clean --help",
  "",
  "Manual page:",
  "  bun run man",
  "  man --local-file man/dust.1",
].join("\n");

export const CLEANUP_LOG_PATH = path.join(os.homedir(), ".local", "state", "dust", "logs", "cleanup.log");
