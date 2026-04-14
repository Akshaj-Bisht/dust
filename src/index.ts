#!/usr/bin/env bun

import { Command } from "commander";
import { registerCleanCommand } from "./commands/clean";
import { registerScanCommand } from "./commands/scan";

const program = new Command();

program
  .name("dust")
  .description("Fast, minimal CLI tool to scan and clean disk space on Linux.")
  .version("1.0.0");

registerScanCommand(program);
registerCleanCommand(program);

program.parse();