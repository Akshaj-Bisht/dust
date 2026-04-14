type TerminalLauncher = {
  name: string;
  command: string[];
};

const shellEscape = (value: string): string => {
  return `'${value.replaceAll("'", `'\\''`)}'`;
};

const buildChildCommand = (): string => {
  const bunPath = process.argv[0] ?? "bun";
  const scriptPath = process.argv[1] ?? "src/index.ts";
  return `${shellEscape(bunPath)} ${shellEscape(scriptPath)} --tui-child`;
};

const resolveTerminalLaunchers = (childCommand: string): TerminalLauncher[] => {
  return [
    { name: "kitty", command: ["kitty", "--detach", "sh", "-lc", childCommand] },
    { name: "wezterm", command: ["wezterm", "start", "--", "sh", "-lc", childCommand] },
    { name: "gnome-terminal", command: ["gnome-terminal", "--", "sh", "-lc", childCommand] },
    { name: "konsole", command: ["konsole", "-e", "sh", "-lc", childCommand] },
    { name: "alacritty", command: ["alacritty", "-e", "sh", "-lc", childCommand] },
    { name: "xterm", command: ["xterm", "-e", "sh", "-lc", childCommand] },
  ];
};

const canRunBinary = (binary: string): boolean => {
  const check = Bun.spawnSync({
    cmd: ["sh", "-lc", `command -v ${shellEscape(binary)} >/dev/null 2>&1`],
    stdout: "ignore",
    stderr: "ignore",
  });
  return check.exitCode === 0;
};

export const launchTuiInNewTerminal = (): boolean => {
  if (process.env.DUST_DISABLE_NEW_WINDOW === "1") {
    return false;
  }

  const childCommand = buildChildCommand();
  const launchers = resolveTerminalLaunchers(childCommand);

  for (const launcher of launchers) {
    if (!canRunBinary(launcher.name)) {
      continue;
    }

    try {
      const proc = Bun.spawn({
        cmd: launcher.command,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
        env: {
          ...process.env,
          DUST_TUI_CHILD: "1",
        },
      });
      proc.unref();
      return true;
    } catch {
      // Try next launcher.
    }
  }

  return false;
};
